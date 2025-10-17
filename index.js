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

// MongoDB connection (use environment variable for credentials)
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI environment variable. Set it in .env");
  process.exit(1);
}

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
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

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
        const regex = new RegExp(email, "i"); // artial match
        const user = await usersCollection
          .find({ email: { $regex: regex } })
          .limit(10)
          .toArray();
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
        res
          .status(500)
          .send({ success: false, message: "Failed to make admin" });
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
        res
          .status(500)
          .send({ success: false, message: "Failed to remove admin" });
      }
    });

    app.get("/users/role/:email", verifytoken, async (req, res) => {
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

    //  Get parcels for a specific user (by email)
    app.get("/Parcel", async (req, res) => {
      try {
        const { email } = req.query;
        let query = {};

        if (email) {
          // match your Parcel field
          query.createdBy = email;
        }

        const parcels = await Parcelcollection.find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(parcels);
      } catch (error) {
        console.error("Error fetching parcels:", error);
        res.status(500).send({ message: "Failed to fetch parcels" });
      }
    });

    // Delete Parcel
    app.delete("/Parcel/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await Parcelcollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to delete parcel" });
      }
    });

    //  Mark Parcel as collected
    app.patch("/parcel/collected/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await Parcelcollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              deliveryStatus: "Collected",
              status: "Delivered",
              collectedAt: new Date(),
            },
          }
        );
        res.send({ modified: result.modifiedCount > 0 });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to mark as collected" });
      }
    });

    // Update parcel payment status
    app.patch("/parcel/pay/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await Parcelcollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              paymentStatus: "paid",
              paidAt: new Date(),
              deliveryStatus: "Not Collected",
              status: "Processing",
            },
          }
        );
        res.send({ modified: result.modifiedCount > 0 });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to mark as paid" });
      }
    });
    //  GET all payments (optional: admin)
    app.get("/Payments", verifytoken, async (req, res) => {
      try {
        const useremail = req.query.email; //  GET -> use query
        const query = useremail ? { email: useremail } : {};
        const options = { sort: { paidAt: -1 } };

        const payments = await Paymenthistorycollection.find(
          query,
          options
        ).toArray();
        res.send(payments);
      } catch (error) {
        console.error("GET /Payments Error:", error);
        res.status(500).send({ message: error.message });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amountcents, id } = req.body;

        console.log("Incoming payment intent request:", req.body);

        // 🔹 Validate amountcents
        if (!amountcents || isNaN(amountcents) || amountcents <= 0) {
          console.error("Invalid amountcents:", amountcents);
          return res.status(400).send({ error: "Invalid amountcents" });
        }

        // 🔹 Validate parcel id
        if (!id) {
          console.error("Missing parcel id");
          return res.status(400).send({ error: "Missing parcel id" });
        }

        // 🔹 Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountcents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
        });

        console.log("PaymentIntent created:", paymentIntent.id);

        //  Save to MongoDB
        if (!Paymenthistorycollection) {
          console.error("Paymenthistorycollection not defined!");
          return res.status(500).send({ error: "DB collection not ready" });
        }

        await Paymenthistorycollection.insertOne({
          parcelId: id,
          amount: amountcents / 100,
          clientSecret: paymentIntent.client_secret,
          createdAt: new Date(),
        });

        console.log("Payment history saved for parcel:", id);

        // 🔹 Respond with clientSecret
        res.send({
          clientSecret: paymentIntent.client_secret,
          amount: amountcents,
        });
      } catch (error) {
        console.error("Stripe or DB Error:", error);
        res
          .status(500)
          .send({ error: error.message || "Internal Server Error" });
      }
    });

    app.post("/payment-success", verifytoken, async (req, res) => {
      try {
        const { parcelId, amount, transactionId, email } = req.body;

        // 1️Insert payment record
        await Paymenthistorycollection.insertOne({
          parcelId,
          amount,
          transactionId,
          email,
          status: "succeeded",
          createdAt: new Date(),
        });

        // 2️ Update Parcel document
        const updateParcel = await Parcelcollection.updateOne(
          { _id: new ObjectId(parcelId) },
          {
            $set: {
              paymentStatus: "paid",
              deliveryStatus: "In-Transit", // set default after payment
              paymentAt: new Date(),
            },
          }
        );

        if (updateParcel.modifiedCount > 0) {
          return res.send({
            success: true,
            message: "Payment recorded and parcel updated",
          });
        } else {
          return res
            .status(404)
            .send({ success: false, message: "Parcel not found" });
        }
      } catch (err) {
        console.error("Payment Success Error:", err);
        res.status(500).send({ error: err.message });
      }
    });

    //  Get user payment history (sorted latest first)
    app.get("/payment-history", verifytoken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).send({ message: "Email required" });

        // Ensure token matches user email
        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden: email mismatch" });
        }

        const history = await Paymenthistorycollection.find({ email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(history);
      } catch (error) {
        console.error("GET /payment-history Error:", error);
        res.status(500).send({ message: error.message });
      }
    });
    app.get("/Parcel/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const parcel = await Parcelcollection.findOne(query);
        if (!parcel)
          return res.status(404).send({ message: "Parcel not found" });
        res.send(parcel);
      } catch (error) {
        console.error("Error fetching parcel:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

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
    app.get("/rideres/pending", verifytoken, verifyAdmin, async (req, res) => {
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
    app.patch(
      "/rideres/approve/:id",
      verifytoken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

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
          res.status(404).send({
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
    app.get("/rideres/active", verifytoken, verifyAdmin, async (req, res) => {
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

    //  Modified route: use address instead of district
    app.get("/rideres/by-district", async (req, res) => {
      try {
        const { district } = req.query;
        const query = district
          ? { address: district, status: "Active" } //  here changed district → address
          : { status: "Active" };
        const riders = await riderescollection.find(query).toArray();
        res.send(riders);
      } catch (error) {
        console.error("Error fetching riders by district:", error);
        res.status(500).send({ message: "Failed to fetch riders" });
      }
    });

    app.patch("/assign-rider", async (req, res) => {
      try {
        const { parcelId, riderId, riderEmail } = req.body;

        if (!parcelId || !riderId || !riderEmail) {
          return res
            .status(400)
            .send({ message: "Missing parcelId, riderId or riderEmail" });
        }

        // Update parcel with assigned rider & status to in_transit
        const parcelFilter = { _id: new ObjectId(parcelId) };
        const parcelUpdate = {
          $set: {
            assigned_rider_email: riderEmail,
            assignedRider: new ObjectId(riderId),
            status: "in_transit", // Automatically set to in_transit
            assignedAt: new Date(),
            updatedAt: new Date(),
          },
        };
        const parcelResult = await Parcelcollection.updateOne(
          parcelFilter,
          parcelUpdate
        );

        // Update rider work status
        const riderFilter = { _id: new ObjectId(riderId) };
        const riderUpdate = { $set: { workStatus: "In Delivery" } };
        const riderResult = await riderescollection.updateOne(
          riderFilter,
          riderUpdate
        );

        res.send({
          message:
            " Rider assigned successfully and parcel status set to In Transit",
          parcelUpdated: parcelResult.modifiedCount > 0,
          riderUpdated: riderResult.modifiedCount > 0,
        });
      } catch (error) {
        console.error("Error assigning rider:", error);
        res.status(500).send({ message: "Failed to assign rider" });
      }
    });

    // GET PENDING DELIVERIES FOR RIDER

    app.get("/parcels/pending-deliveries", async (req, res) => {
      try {
        const { rider_email } = req.query;
        if (!rider_email) {
          return res.status(400).send({ message: "Rider email is required" });
        }

        const query = {
          assigned_rider_email: rider_email,
          status: { $in: ["in_transit"] }, // Only in_transit parcels
        };

        const pendingParcels = await Parcelcollection.find(query).toArray();
        res.send(pendingParcels);
      } catch (error) {
        console.error("Error fetching pending deliveries:", error);
        res.status(500).send({ message: "Failed to fetch pending deliveries" });
      }
    });

   // ✅ UPDATE PARCEL STATUS (Delivered / Other)
app.patch("/parcels/update-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).send({ success: false, message: "Status is required" });
    }

    const validStatuses = ["rider_assigned", "in_transit", "Delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).send({ success: false, message: "Invalid status" });
    }

    // Base update fields
    const updateFields = {
      status,
      updatedAt: new Date(),
    };

    // If parcel is delivered → calculate earning
    if (status === "Delivered") {
      const parcel = await Parcelcollection.findOne({ _id: new ObjectId(id) });
      if (!parcel) {
        return res.status(404).send({ success: false, message: "Parcel not found" });
      }

      // Calculate earning dynamically
      const sameDistrict = parcel.sender_region === parcel.receiver_region;
      const earning = sameDistrict
        ? parcel.cost * 0.8   // 80% if same district
        : parcel.cost * 0.3;  // 30% if different district

      updateFields.deliveryStatus = "Delivered";
      updateFields.deliveryDate = new Date();
      updateFields.earningAmount = earning;
    }

    // Update in DB
    const result = await Parcelcollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.modifiedCount > 0) {
      res.send({
        success: true,
        message: `Parcel marked as ${status}`,
        earningAdded: updateFields.earningAmount || 0,
      });
    } else {
      res.status(404).send({ success: false, message: "Parcel not found" });
    }
  } catch (error) {
    console.error("Error updating parcel status:", error);
    res.status(500).send({ success: false, message: "Failed to update parcel status" });
  }
});
    //  Fetch all completed deliveries for a rider
app.get("/parcels/completed-deliveries", async (req, res) => {
  try {
    const { rider_email } = req.query;

    if (!rider_email) {
      return res.status(400).send({ message: "Rider email is required" });
    }
    
    //  Updated query to match your data correctly
    const query = {
      assigned_rider_email: rider_email,
      $or: [
        { deliveryStatus: { $in: ["Delivered", "service_center_deliver"] } },
        { status: "Delivered" }, // include documents where only "status" is Delivered
      ],
    };
    const completedParcels = await Parcelcollection.find(query)
      .sort({ updatedAt: -1 })
      .toArray();

    res.send(completedParcels);
  } catch (error) {
    console.error("Error fetching completed deliveries:", error);
    res.status(500).send({ message: "Failed to fetch completed deliveries" });
  }
  
});

//  Mark all completed deliveries as cashed out
app.post("/rider/cashout", async (req, res) => {
  try {
    const { rider_email } = req.body;

    if (!rider_email) {
      return res.status(400).send({ message: "Rider email is required" });
    }

    //  Find completed (but not cashed out) parcels
    const parcels = await Parcelcollection.find({
      assigned_rider_email: rider_email,
      $or: [
        { deliveryStatus: { $in: ["Delivered", "service_center_deliver"] } },
        { status: "Delivered" },
      ],
      paymentStatus: { $ne: "cashed_out" },
    }).toArray();

    if (parcels.length === 0) {
      return res.status(400).send({
        message: "No unpaid completed deliveries found for this rider.",
      });
    }

    //  Update all those parcels as cashed out
    const ids = parcels.map((p) => p._id);
    await Parcelcollection.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          paymentStatus: "cashed_out",
          cashedOutAt: new Date(),
        },
      }
    );

    //  Optional: Keep a record of the cashout
    await db.collection("cashouts").insertOne({
      rider_email,
      parcelCount: parcels.length,
      cashedOutAt: new Date(),
    });

    res.send({
      success: true,
      message: "Cashout completed successfully.",
      cashedOutCount: parcels.length,
    });
  } catch (error) {
    console.error(" Error processing cashout:", error);
    res.status(500).send({ message: "Failed to process cashout" });
  }
});
//  RIDER EARNINGS API
app.get("/rider/earnings", async (req, res) => {
  try {
    const { rider_email } = req.query;
    if (!rider_email) {
      return res.status(400).send({ message: "Rider email required" });
    }

    // Fetch all delivered parcels
    const parcels = await Parcelcollection.find({
      assigned_rider_email: rider_email,
      deliveryStatus: "Delivered",
      earningAmount: { $exists: true },
    }).toArray();

    // Return the earnings list with date & amount
    res.send(parcels);
  } catch (error) {
    console.error("Error fetching rider earnings:", error);
    res.status(500).send({ message: "Failed to fetch rider earnings" });
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
