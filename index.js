const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//lead environment
dotenv.config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri =
  "mongodb+srv://Parcel:Parcel123@co.sb0kq7l.mongodb.net/?retryWrites=true&w=majority&appName=Co";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    //  Choose database and collection
    const db = client.db("Parceldb"); // Database name
    const Parcelcollection = db.collection("Parcel");
    const Paymenthistorycollection = db.collection("Payments");
    const TrackingCollection= db.collection('tracking')
    const usersCollection= db.collection('users')
app.post('/users', async (req, res) => {
  try {
    const user = req.body;
    const email = user.email; // ✅ fixed typo

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
      return res
        .status(200)
        .send({ message: 'User already exists', inserted: false });
    }

    // If not found, insert new user
    const result = await usersCollection.insertOne(user);
    res.send({ message: 'User inserted successfully', inserted: true, result });
  } catch (error) {
    console.error('Error inserting user:', error);
    res.status(500).send({ message: 'Server error', error });
  }
});


    // Post : create a new Parcel
    app.post("/Parcel", async (req, res) => {
      try {
        const newParcel = req.body;
        const result = await Parcelcollection.insertOne(newParcel);
        res.status(201).send(result);
      } catch {
        console.log("error ", error);
        res.status(403).send({ message: "failded to laeded" });
      }
    });
    // Parcel API
    // get Parcel by user email sorted by latest data

    app.get("/Parcel", async (req, res) => {
      try {
        const useremail = req.query.email;
        
        const query = useremail ? { createdBy: useremail } : {};
        const options = {
          sort: {
            createdAt: -1,
          },
        };
        const Parcel = await Parcelcollection.find(query, options).toArray();
        res.send(Parcel);
      } catch (error) {
        console.log(error, "error showing ");
      }
    });
    /// get sPecific Parcel by id
    app.get("/Parcel/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const Parcel = await Parcelcollection.findOne(query);
        res.send(Parcel);
      } catch (error) {
        console.log(error);
      }
    });

    // /create-payment-intent  to save from the frontend

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amountcents } = req.body; //  extract correctly
        const paymentIntent = await stripe.paymentIntents.create({
          amount: parseInt(amountcents), //  must be integer (cents)
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret }); //  correct key spelling
      } catch (error) {
        res.status(402).send(error);
      }
    });

    //  Mark Parcel as paid & store payment record
    app.post("/payment-success", async (req, res) => {
      try {
        const { parcelId, transactionId, amount, email } = req.body;

        // 1️ Update Parcel status
        const filter = { _id: new ObjectId(parcelId) };
        const updateDoc = {
          $set: {
            paymentStatus: "paid",
            transactionId,
            paidAt: new Date(),
          },
        };
        const updateResult = await Parcelcollection.updateOne(
          filter,
          updateDoc
        );

        // 2️ Create PaymentHistory entry
        const historyDoc = {
          parcelId, //  match frontend key
          transactionId,
          amount,
          email,
          paid_at_string: new Date().toISOString(),
          status: "succeeded",
          createdAt: new Date(),
        };

        const insertResult = await Paymenthistorycollection.insertOne(
          historyDoc
        );

        res.send({
          message: "Payment recorded successfully",
          parcelUpdated: updateResult.modifiedCount > 0,
          historySaved: insertResult.insertedId,
        });
      } catch (error) {
        console.error("Payment success API error:", error);
        res.status(500).send({ message: error.message });
      }
    });

    //  Get user payment history (latest first)
    app.get("/payment-history", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).send({ message: "Email required" });

        const history = await Paymenthistorycollection.find({ email })
          .sort({ createdAt: -1 }) //  descending order
          .toArray();

        res.send(history);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    //delete Parcel
    app.delete("/Parcel/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const rsult = await Parcelcollection.deleteOne(query);
      res.send(rsult);
    });

    // Add a new tracking update
    // Tracking collection
    
 // Add a new tracking update
    app.post("/tracking", async (req, res) => {
      try {
        const { parcelId, trackingId, status, location, notes, lat, lng } = req.body;

        const newUpdate = {
          parcelId,
          trackingId,
          status,
          location,
          notes,
          lat,
          lng,
          createdAt: new Date(),
        };

        const result = await TrackingCollection.insertOne(newUpdate);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Tracking insert error:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // Get tracking updates by trackingId or parcelId
    app.get("/tracking", async (req, res) => {
      try {
        const { trackingId, parcelId } = req.query;

        let query = {};
        if (trackingId) query.trackingId = trackingId;
        if (parcelId) query.parcelId = parcelId;

        const updates = await TrackingCollection.find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(updates);
      } catch (error) {
        console.error("Tracking fetch error:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });



    //  Confirm MongoDB connection
    await client.db("admin").command({ ping: 1 });
    console.log(" MongoDB connected successfully!");
  } catch (error) {
    console.error(" MongoDB connection failed:", error);
  }
}

run().catch(console.dir);

// Default route
app.get("/", (req, res) => {
  res.send("User Parcel server");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
