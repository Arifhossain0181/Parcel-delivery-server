const express = require("express");
const cors = require("cors");
var admin = require("firebase-admin");
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
// firebase
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    const TrackingCollection = db.collection("tracking");
    const usersCollection = db.collection("users");
    const riderescollection = db.collection("rideres");

    //custom middel ware in for jwt

    const verifytoken = async (req, res, next) => {
      try {
        console.log("headers:", req.headers);

        const authHeader = req.headers["authorization"]; // lowercase!
        if (!authHeader) {
          return res
            .status(401)
            .send({ message: "Unauthorized access: no header" });
        }

        const token = authHeader.split(" ")[1]; // Bearer <token>
        if (!token) {
          return res 
            .status(401)
            .send({ message: "Unauthorized access: no token" });
        }

        // Verify the token
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;

        next();
      } catch (error) {
        console.error(error);
        return res.status(401).send({ message: "Forbidden access" });
      }
    };

    // jwt end 
    const verifyAdmin = async (req, res, next) => {
       const email = req.decoded.email;
       const query = { email: email };
       const user = await usersCollection.findOne(query);
       if(!user || user.role !== 'admin'){
        return res.status(403).send({message: 'forbidden access'})
       }
        next();
    }

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const email = user.email; //  fixed typo

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          return res
            .status(200)
            .send({ message: "User already exists", inserted: false });
        }

        // If not found, insert new user
        const result = await usersCollection.insertOne(user);
        res.send({
          message: "User inserted successfully",
          inserted: true,
          result,
        });
      } catch (error) {
        console.error("Error inserting user:", error);
        res.status(500).send({ message: "Server error", error });
      }
    });

    


    // GET /users/search?email=user@example.com
    app.get("/users/search", async (req, res) => {
      const email = req.query.email;
      if (!email)
        return res
          .status(400)
          .send({ success: false, message: "Email required" });

      try {
        const regex = new RegExp(email ,'i') // artial match
        const user = await usersCollection.find({ email: {$regex:regex} }).limit(10).toArray()
        if (!user)
          return res
            .status(404)
            .send({ success: false, message: "User not found" });

        res.send({ success: true, user });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to search user" });
      }
    });

    // PATCH /users/admin/:id
app.patch("/users/admin/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: "admin" } }
    );
    res.send({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Failed to make admin" });
  }
});

// PATCH /users/remove-admin/:id
app.patch("/users/remove-admin/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: "user" } }
    );
    res.send({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Failed to remove admin" });
  }
});

app.get("/users/role/:email",verifytoken, async (req, res) => {
  try {
    const email = req.params.email;

    //from the  database to find user 
    const user = await usersCollection.findOne({ email });

    // if user not found
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // send back the role
    res.send({ role: user.role });
  } catch (error) {
    console.error("Error fetching user role:", error);
    res.status(500).send({ message: "Server error" });
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
    // Payment
    app.get("/Payments", async (res, req) => {
      try {
        const useremail = req.body.email;
        const query = useremail ? { email: useremail } : {};
        const options = { sort: { paidAt: -1 } };
        const Payments = await Paymenthistorycollection.find(
          query,
          options
        ).toArray();
        res.send(Payments);
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
    //  Mark parcel as collected
app.patch("/parcel/collected/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        deliveryStatus: "Collected",
        status: "Delivered",
        collectedAt: new Date(),
      },
    };
    const result = await Parcelcollection.updateOne(filter, updateDoc);

    res.send({
      message: "Parcel marked as collected",
      modified: result.modifiedCount > 0,
    });
  } catch (error) {
    console.error("Mark collected error:", error);
    res.status(500).send({ message: error.message });
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
            status: "Processing",
             deliveryStatus: "Not Collected", 
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
    app.get("/payment-history", verifytoken, async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) return res.status(400).send({ message: "Email required" });

        // Optional: verify email matches token
        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden: email mismatch" });
        }

        const history = await Paymenthistorycollection.find({ email })
          .sort({ createdAt: -1 })
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
        const { parcelId, trackingId, status, location, notes, lat, lng } =
          req.body;

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

    // Add new rider
    app.post("/rideres", async (req, res) => {
      try {
        const rider = req.body;
        rider.status = "Pending";
        const result = await riderescollection.insertOne(rider);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to add rider" });
      }
    });

    // Get pending riders
    app.get("/rideres/pending",verifytoken, verifyAdmin, async (req, res) => {
      try {
        const pendingRiders = await riderescollection
          .find({ status: "Pending" })
          .toArray();
        res.send(pendingRiders);
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch pending riders" });
      }
    });

    // Approve rider → status + role
    app.patch("/rideres/approve/:id",verifytoken,verifyAdmin, async (req, res) => {
      const { id } = req.params;
      try {
        const rider = await riderescollection.findOne({
          _id: new ObjectId(id),
        });
        if (!rider)
          return res
            .status(404)
            .send({ success: false, message: "Rider not found" });

        const email = rider.email;

        const result = await riderescollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Active" } }
        );

        const userResult = await usersCollection.updateOne(
          { email },
          { $set: { role: "rider" } }
        );

        res.send({
          success: true,
          riderUpdated: result.modifiedCount,
          roleUpdated: userResult.modifiedCount,
        });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to approve rider" });
      }
    });

    // Reject rider → delete
    app.delete("/rideres/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await riderescollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.send({ success: true, deletedCount: result.deletedCount });
        } else {
          res.status(404).send({ success: false, message: "Rider not found" });
        }
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to reject rider" });
      }
    });

    // Deactivate rider
    app.patch("/rideres/deactivate/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const rider = await riderescollection.findOne({
          _id: new ObjectId(id),
        });
        const email = rider.email;

        const result = await riderescollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Inactive" } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, modifiedCount: result.modifiedCount });
        } else {
          res
            .status(404)
            .send({
              success: false,
              message: "Rider not found or already inactive",
            });
        }

        const userResult = await usersCollection.updateOne(
          { email },
          { $set: { role: "user" } }
        );

        res.send({
          success: true,
          riderUpdated: result.modifiedCount,
          roleUpdated: userResult.modifiedCount,
        });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to deactivate rider" });
      }
    });

    // Get all active riders
    app.get("/rideres/active",verifytoken,verifyAdmin, async (req, res) => {
      try {
        const activeRiders = await riderescollection
          .find({ status: "Active" })
          .toArray();
        res.send(activeRiders);
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch active riders" });
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
