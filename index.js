const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config();
const app = express();

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8v7eukl.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

function verifyJWT(req, res, next) {
  console.log('token inside verifyJWT', req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('unauthorized access');
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    req.decoded = decoded;
    next();
  })
}



/**
   advance opration need to learn
 * mongodb lockup aggrement
 * mongodb pipeline match
 * 
 */

async function run() {
  try {


    const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
    const bookingsCollection = client.db('doctorsPortal').collection('bookings');
    const usersCollection = client.db('doctorsPortal').collection('users');
    const doctorsCollection = client.db('doctorsPortal').collection('doctors');

    //it must have to execute after executing verifyJWT
    const verifyAdmin = async(req, res, next) =>{
      console.log('inside verify Admin', req.decoded.email);
      const decodedEmail = req.decoded.email;
      const query = {email: decodedEmail};
      const user = await usersCollection.findOne(query);
      if(user?.role !== 'admin'){
        return res.status(403).send({message: 'forbidden access'});
      }
      next();
    }

    app.get('/appointmentOptions', async (req, res) => {
      const date = req.query.date;
      console.log(date);
      const query = {}; //empty object for all data
      const options = await appointmentOptionCollection.find(query).toArray();
      //get the bookings of the provided date
      const bookingQuery = { appointmentDate: date }
      const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
      //it's for find the alreadybooked date and time
      options.forEach(option => {
        const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
        const bookedSlots = optionBooked.map(book => book.slot);
        const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
        option.slots = remainingSlots;
        console.log(option.name, remainingSlots.length);
      })
      res.send(options);
    });

    //get specific data from appointment list
    app.get('/appointmentSpecialty', async(req, res)=>{
      const query = {}
      const result = await appointmentOptionCollection.find(query).project({name:1}).toArray();

      res.send(result);
    })

    /**
     * API Naming Convention for bookings
     * app.get('/bookings')
     * app.get('/bookings/:id')
     * app.post('bookings')
     * app.patch('/bookings/:id')
     * app.delete('/bookings/:id')
     */

    app.get('/bookings', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get('/bookings/:id', async(req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const bookings = await bookingsCollection.findOne(query);
      res.send(bookings);

    })

    app.post('/bookings', async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment
      }
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message })
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    //jwt
    app.get('/jwt', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accesstoken: '' });
    })

    //get allusers
    app.get('/users', async(req, res)=>{
      const query ={};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    })

    //checking the user is admin or not
    app.get('/users/admin/:email', async(req, res)=>{
      const email = req.params.email;
      const query = {email};
      const user = await usersCollection.findOne(query);
      res.send({isAdmin: user?.role === 'admin'});
    })

    //for users
    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    app.put('/users/admin/:id', verifyJWT, verifyAdmin, async(req, res)=>{
      

      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const options = {upsert: true};
      const updatedDoc = {
        $set:{
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc, options);
      res.send(result);
    });

    //temporary to update price field on appointment options
    // app.get('/addPrice', async(req, res)=>{
    //   const filter = {};
    //   const options = {upsert: true}
    //   const updateDoc ={
    //     $set:{
    //       price: 99
    //     }
    //   }
    //   const result = await appointmentOptionCollection.updateMany(filter, updateDoc, options);
    //   res.send(result);
    // });
    
    //geting doctors
    app.get('/doctors',verifyJWT, verifyAdmin, async(req, res)=>{
      const query = {};
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    })

    //adding doctors
    app.post('/doctors',verifyJWT, verifyAdmin, async(req, res)=>{
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    })

    //deleting doctors
    app.delete('/doctors/:id',verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const result = await doctorsCollection.deleteOne(filter);
      res.send(result);
    })

  }
  finally {
    console.log('it is done');
  }
}
run().catch(console.dir);


app.get('/', async (req, res) => {
  res.send('doctors portal server is running');
})

app.listen(port, () => {
  console.log(`Doctors portal running on ${port}`);
})