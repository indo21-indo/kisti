// index.js
require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());

// MongoDB client
const client = new MongoClient(MONGO_URI);
let db, members;

async function initDB() {
  await client.connect();
  db = client.db("loanDB");
  members = db.collection("members");
}
//
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Add new member with loan info
app.get("/add-member", async (req, res) => {
  try {
    const { name, nid, phone, address, amount, weeks } = req.query;
    if (!name || !nid || !phone || !amount || !weeks) {
      return res.status(400).send("Missing required fields");
    }
    const numericAmount = parseInt(amount);
    const numericWeeks = parseInt(weeks);
    const serviceCharge = Math.round(numericAmount * 0.2); // 20%
    const totalPayable = numericAmount + serviceCharge;
    const weeklyInstallment = Math.round(totalPayable / numericWeeks);

    const member = {
      name,
      nid,
      phone,
      address,
      loan: {
        amount: numericAmount,
        weeks: numericWeeks,
        serviceCharge,
        totalPayable,
        weeklyInstallment,
        startDate: new Date().toISOString(),
        status: "running"
      },
      installments: []
    };

    const result = await members.insertOne(member);
    res.json({ message: "Member added", id: result.insertedId });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// Add installment for a member
app.get("/add-installment", async (req, res) => {
  try {
    const { memberId, amount, weekNo } = req.query;
    if (!memberId || !amount || !weekNo) return res.status(400).send("Missing fields");

    const installment = {
      amountPaid: parseInt(amount),
      weekNo: parseInt(weekNo),
      paymentDate: new Date().toISOString()
    };

    const result = await members.updateOne(
      { _id: new ObjectId(memberId) },
      { $push: { installments: installment } }
    );

    if (result.modifiedCount === 0) return res.status(404).send("Member not found");

    res.json({ message: "Installment added" });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// View member loan status
app.get("/status/:id", async (req, res) => {
  try {
    const member = await members.findOne({ _id: new ObjectId(req.params.id) });
    if (!member) return res.status(404).send("Member not found");

    const totalPaid = member.installments.reduce((sum, i) => sum + i.amountPaid, 0);
    const remaining = member.loan.totalPayable - totalPaid;

    res.json({
      name: member.name,
      loan: member.loan,
      totalPaid,
      remaining,
      installments: member.installments
    });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// List all members
app.get("/all-members", async (req, res) => {
  try {
    const data = await members.find({}).project({ name: 1, nid: 1, phone: 1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// Start server and connect to DB
initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error("Failed to connect to DB", err);
});
