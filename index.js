

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);


const app = express();
const port = process.env.PORT || 3000;

// Middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// Verify JWT Token Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.error(err);
      return res.status(401).json({ message: 'Unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

// MongoDB Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1bdxs.mongodb.net/?retryWrites=true&w=majority`;

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Main Function to Connect to MongoDB and Define Routes
async function run() {
  try {
    const db = client.db('scholarshipDB');
    const usersCollection = db.collection('users');
    const scholarshipCollection = db.collection('scholarship');
    const ordersCollection = db.collection('orders');
    const checkoutCollection = db.collection('checkout');
    const paymentCollection = db.collection('payments');

      // verify admin middleware
      const verifyAdmin = async (req, res, next) => {
        // console.log('data from verifyToken middleware--->', req.user?.email)
        const email = req.user?.email
        const query = { email }
        const result = await usersCollection.findOne(query)
        if (!result || result?.role !== 'admin')
          return res
            .status(403)
            .send({ message: 'Forbidden Access! Admin Only Actions!' })
  
        next()
      }

    // User Routes
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = req.body;
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send(existingUser);
      }
      const result = await usersCollection.insertOne({ ...user, role: 'customer', timestamp: Date.now() });
      res.send(result);
    });


      // get all user data
      app.get('/all-users/:email', verifyToken, verifyAdmin, async (req, res) => {
        const email = req.params.email
        const query = { email: { $ne: email } }
        const result = await usersCollection.find(query).toArray()
        res.send(result)
      })
  
         // update a user role & status
    app.patch(
      '/user/role/:email',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email
        const { role } = req.body
        const filter = { email }
        const updateDoc = {
          $set: { role, status: 'Verified' },
        }
        const result = await usersCollection.updateOne(filter, updateDoc)
        res.send(result)
      }
    )


    // Scholarship Routes
    app.get('/scholarship', async (req, res) => {
      const scholarships = await scholarshipCollection.find().toArray();
      res.send(scholarships);
    });

    app.post('/scholarship', verifyToken, async (req, res) => {
      const scholarship = req.body;
      try {
        const result = await scholarshipCollection.insertOne(scholarship);
        res.status(200).send({ message: 'Scholarship added successfully', result });
      } catch (error) {
        console.error('Error adding scholarship:', error);
        res.status(500).send({ message: 'Failed to add scholarship', error: error.message });
      }
    });

    app.get('/scholarship/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const scholarship = await scholarshipCollection.findOne({ _id: new ObjectId(id) });
        if (!scholarship) {
          return res.status(404).send({ error: 'Scholarship not found' });
        }
        res.send(scholarship);
      } catch (error) {
        console.error('Error fetching scholarship details:', error);
        res.status(500).send({ error: 'Failed to fetch scholarship details' });
      }
    });





    // get all orders for a specific customer
    app.get('/customer-orders/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { 'userEmail': email };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });
    app.get('/customer-orders/:email', verifyToken, async (req, res) => {

      const email = req.params.email
      const result = await ordersCollection
        .aggregate([
          {
            $match: { 'applicant.email': email }, //Match specific customers data only by email
          },
          {
            $addFields: {
              userId: { $toObjectId: '$userId' }, //convert plantId string field to objectId field
            },
          },
          {
            $lookup: {
              // go to a different collection and look for data
              from: 'scholarship', // collection name
              localField: 'userId', // local data that you want to match
              foreignField: '_id', // foreign field name of that same data
              as: 'scholarship', // return the data as plants array (array naming)
            },
          },
          { $unwind: '$scholarship' }, // unwind lookup result, return without array
          {
            $addFields: {
              // add these fields in order object
              name: '$scholarship.name',
              image: '$scholarship.image',
              category: '$scholarship.category',
            },
          },
          {
            // remove plants object property from order object
            $project: {
              scholarship: 0,
            },
          },
        ])
        .toArray()

      res.send(result)
    })









    // Cancel/delete an order
    app.delete('/orders/:id', verifyToken, async (req, res) => {

      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const order = await ordersCollection.findOne(query)
      if (order.status === 'Delivered')
        return res
          .status(409)
          .send('Cannot cancel once the product is delivered!')
      const result = await ordersCollection.deleteOne(query)
      res.send(result)
    })

  

  
    
  
    

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { fee } = req.body; // Use `fee` as your field name
        if (!fee) {
          return res.status(400).send({ error: "Fee is required" });
        }
    
        const amount = Math.round(fee * 100); // Convert to smallest currency unit (cents)
        console.log("Amount for Payment Intent:", amount);
    
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
    
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    
    app.get('/payments/:email',verifyToken, async (req, res) => {
      const email = req.params.email;
      if(req.params.email !== req.user.email){
        return res.status(403).send({message: 'Forbidden access'})
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })
    



app.post('/payments', verifyToken, async (req, res) => {
  try {
    const paymentData = req.body;

    // Validate required fields
    if (!paymentData.transactionId || !paymentData.email || !paymentData.Fee) {
      return res.status(400).send({ message: 'Missing required payment fields.' });
    }

    // Prepare the payment data to save in the database
    const payment = {
      email: paymentData.email,
      name: paymentData.name,
      Fee: paymentData.Fee,
      transactionId: paymentData.transactionId,
      date: new Date(),
      status: "pending"  // Or any status you need (e.g., 'completed', 'failed')
    };

    // Insert payment data into the database
    const paymentResult = await paymentCollection.insertOne(payment);

    console.log(paymentResult, 'Payment Result');

    // Respond with success status
    res.status(201).send(paymentResult);
  } catch (error) {
    console.error('Error saving payment:', error);

    // Respond with error status
    res.status(500).send({ message: 'Failed to save payment. Please try again later.' });
  }
});
    

    //appication data save in database

    app.post('/order', verifyToken, async (req, res) => {
      const order = req.body;
      try {
        const result = await ordersCollection.insertOne(order);
        res.send(result);
      } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).send({ error: 'Failed to save order' });
      }
    });



    //get user role

    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email })
      res.send({ role: result?.role })
    })




    // Authentication Routes
    app.post('/jwt', (req, res) => {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }
      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .json({ success: true, token });
    });

    app.post('/logout', (req, res) => {
      res
        .clearCookie('token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .json({ success: true });
    });


  // checkout data save in database

  app.get("/checkout/:id", async (req, res) => {
    const id = req.params.id;
    const query = { id: id };
    const result = await checkoutCollection.findOne(query);
    res.send(result)
  })


  app.get("/checkout", async (req, res) => {
    const result = await checkoutCollection.find().toArray()
    res.send(result)
  })


  app.post('/checkout', async (req, res) => {
    try {
      const checkoutData = req.body;
      
      // Check for valid data format
      if (!checkoutData || !checkoutData.id) {
        return res.status(400).send({ error: "Invalid data format" });
      }
  
      // Insert the checkout data into MongoDB
      const result = await checkoutCollection.insertOne(checkoutData);
      
      // Send the result back to the frontend
      res.status(200).send(result);
    } catch (error) {
      console.error("Error during checkout:", error);
      res.status(500).send({ error: "Internal Server Error" });
    }
  });

    app.get('/protected', verifyToken, (req, res) => {
      res.json({ message: 'This is a protected route', user: req.user });
    });

    // Ping MongoDB
    await client.db('admin').command({ ping: 1 });
    console.log('Successfully connected to MongoDB!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
  }
}

run().catch(console.dir);

// Root Route
app.get('/', (req, res) => {
  res.send('Hello from Scholarship Server!');
});

// Start Server
app.listen(port, () => {
  console.log(`Scholarship Server running on port ${port}`);
});




