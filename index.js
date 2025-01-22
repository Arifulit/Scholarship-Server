
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const ObjectId = require('mongodb').ObjectId;

const port = process.env.PORT || 3000;
const app = express();

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
// const uri = mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1bdxs.mongodb.net/?retryWrites=true&w=majority;

 const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1bdxs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


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
    const scholarshipCollection = db.collection('scholarship')
  


    // save or update a user in db
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = req.body;
      // check if user exists in db
      const isExist = await usersCollection.findOne(query)
      if(isExist){
        return res.send(isExist)
      }
      const result = await usersCollection.insertOne({
        ...user,
        role: "customer",
        timestamp: Date.now(),
      })
      res.send(result)
    })

// save and all scholarship in DB

    // app.post('/scholarship', verifyToken, async(req,res)=>{
    //   const medicine = req.body;
    //   const result = await scholarshipCollection.insertOne(scholarship);
    //   res.send(result)
    //  })

    // get all scholarship

app.get('/scholarship', async (req, res) => {
  const result = await scholarshipCollection.find().toArray();
  res.send(result);

})

    app.post('/scholarship', verifyToken,  async (req, res) => {

    const scholarship = req.body; // Change 'medicine' to 'scholarship' for consistency

    try {
        // Insert the scholarship into the MongoDB collection
        const result = await scholarshipCollection.insertOne(scholarship);
        res.status(200).send({ message: 'Scholarship added successfully', result });
    } catch (error) {
        console.error('Error adding scholarship:', error);
        res.status(500).send({ message: 'Failed to add scholarship', error: error.message });
    }
});



// app.post('/scholarship', verifyToken, async (req, res) => {
//   const scholarship = req.body;

//   // Data validation
//   const requiredFields = [
//       "scholarshipName",
//       "universityName",
//       "universityLogo",
//       "universityCountry",
//       "universityCity",
//       "universityRank",
//       "subjectCategory",
//       "scholarshipCategory",
//       "degree",
//       "applicationFees",
//       "serviceCharge",
//       "applicationDeadline",
//       "scholarshipPostDate",
//       "postedUserEmail"
//   ];

//   const missingFields = requiredFields.filter(field => !scholarship[field]);

//   if (missingFields.length > 0) {
//       return res.status(400).send({
//           message: "Missing required fields",
//           missingFields,
//       });
//   }

//   try {
//       // Insert scholarship data into MongoDB
//       const result = await scholarshipCollection.insertOne(scholarship);

//       // Send success response
//       res.status(200).send({
//           message: "Scholarship added successfully",
//           result,
//       });
//   } catch (error) {
//       console.error('Error adding scholarship:', error);

//       // Send error response
//       res.status(500).send({
//           message: "Failed to add scholarship",
//           error: error.message,
//       });
//   }
// });

// get scholarship by id
app.get('/scholarship/:id', async (req, res) => {
  const { id } = req.params; // Use `id` instead of `_id`
  try {
    const result = await scholarshipCollection.findOne({ _id: new ObjectId(id) });
    if (!result) {
      return res.status(404).send({ error: "Scholarship not found" });
    }
    res.send(result);
  } catch (error) {
    console.error("Error fetching scholarship details:", error);
    res.status(500).send({ error: "Failed to fetch scholarship details" });
  }
});

    // Generate JWT Token
    app.post('/jwt', (req, res) => {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d',
      });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .json({ success: true, token });
    });

    // Logout Endpoint
    app.post('/logout', (req, res) => {
      res
        .clearCookie('token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .json({ success: true });
    });


 


  


    // Example Protected Route
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
  res.send('Hello from plantNet Server!');
});

// Start Server
app.listen(port, () => {
  console.log(`medicine running on port ${port}`);
});