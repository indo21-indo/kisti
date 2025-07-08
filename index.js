const express = require("express");
const cors = require("cors");
const path = require("path");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const client = new MongoClient(process.env.MONGO_URI);
let db, members;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("loan-app");
    members = db.collection("members");
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error:", err);
  }
}
connectDB();

async function generateUniqueId() {
  let id;
  let exists = true;
  while (exists) {
    id = Math.floor(Math.random() * (2020 - 1010 + 1)) + 1010;
    const existing = await members.findOne({ id });
    if (!existing) exists = false;
  }
  return id;
}

// Add Member
app.get("/add-member", async (req, res) => {
  try {
    const { name, nid, phone, address, amount, weeks } = req.query;
    if (!name || !nid || !phone || !amount || !weeks) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const id = await generateUniqueId();

    const newMember = {
      id,
      name,
      nid,
      phone,
      address,
      loan: {
        amount: Number(amount),
        totalPayable: Number(amount),
        weeklyInstallment: Math.round(Number(amount) / Number(weeks)),
        weeks: Number(weeks),
      },
      installments: [],
      createdAt: new Date(),
    };

    await members.insertOne(newMember);
    res.json({ message: "Member added", id });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Add Installment
app.get("/add-installment", async (req, res) => {
  try {
    const { memberId, weekNo, amount } = req.query;
    const id = Number(memberId);
    const week = Number(weekNo);
    const pay = Number(amount);

    const member = await members.findOne({ id });
    if (!member) return res.status(404).json({ error: "Member not found" });

    const exists = member.installments.find((i) => i.weekNo === week);
    if (exists) return res.status(409).json({ error: "Already paid this week" });

    await members.updateOne(
      { id },
      { $push: { installments: { weekNo: week, amount: pay, date: new Date() } } }
    );

    res.json({ message: `Week ${week} installment added.` });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Member Status
app.get("/status/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const member = await members.findOne({ id });
    if (!member) return res.status(404).json({ error: "Member not found" });

    const totalPaid = member.installments.reduce((sum, i) => sum + i.amount, 0);
    const remaining = member.loan.totalPayable - totalPaid;

    res.json({
      name: member.name,
      loan: member.loan,
      installments: member.installments,
      totalPaid,
      remaining,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// All Members
app.get("/all-members", async (req, res) => {
  try {
    const all = await members
      .find({}, { projection: { _id: 0, id: 1, name: 1, nid: 1, phone: 1 } })
      .toArray();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
