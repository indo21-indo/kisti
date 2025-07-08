const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGO_URI);
let db;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Add member
app.get("/add-member", async (req, res) => {
  const { name, nid, phone, address, amount, weeks } = req.query;
  if (!name || !nid || !phone || !amount || !weeks) {
    return res.json({ error: "সব তথ্য পূরণ করুন" });
  }

  const id = Math.floor(Math.random() * (2020 - 1010 + 1)) + 1010;
  const member = {
    id,
    name,
    nid,
    phone,
    address,
    loan: {
      amount: parseInt(amount),
      weeks: parseInt(weeks),
      weeklyInstallment: Math.round(amount / weeks),
      totalPayable: Math.round(amount),
    },
    createdAt: new Date(),
  };

  await db.collection("members").insertOne(member);
  res.json({ message: "Member added", id });
});

// Add installment
app.get("/add-installment", async (req, res) => {
  const { memberId, weekNo, amount } = req.query;
  const member = await db.collection("members").findOne({ id: parseInt(memberId) });
  if (!member) return res.json({ error: "মেম্বার পাওয়া যায়নি" });

  const totalWeeks = member.loan.weeks;
  const installments = await db.collection("installments").find({ memberId: parseInt(memberId) }).toArray();

  const expectedWeeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const paidWeeks = installments.map((i) => i.weekNo);
  const unpaidWeek = expectedWeeks.find((w) => !paidWeeks.includes(w));

  if (unpaidWeek && unpaidWeek < parseInt(weekNo)) {
    return res.json({ error: "আগের কিস্তি পরিশোধ না করার কারণে এই সপ্তাহের কিস্তি জমা দেওয়া সম্ভব নয়।" });
  }

  const already = installments.find((i) => i.weekNo === parseInt(weekNo));
  if (already) return res.json({ error: "এই সপ্তাহের কিস্তি আগে জমা হয়েছে" });

  await db.collection("installments").insertOne({
    memberId: parseInt(memberId),
    weekNo: parseInt(weekNo),
    amount: parseInt(amount),
    date: new Date(),
  });

  res.json({ message: `সপ্তাহ ${weekNo} এর ${amount} টাকা জমা হয়েছে` });
});

// Get member status
app.get("/status/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const member = await db.collection("members").findOne({ id });
  if (!member) return res.json({ error: "মেম্বার পাওয়া যায়নি" });

  const installments = await db.collection("installments").find({ memberId: id }).toArray();
  const totalPaid = installments.reduce((sum, i) => sum + i.amount, 0);
  const remaining = member.loan.totalPayable - totalPaid;

  res.json({
    ...member,
    totalPaid,
    remaining,
    installments,
  });
});

// Get all members
app.get("/all-members", async (req, res) => {
  const members = await db.collection("members").find().toArray();
  res.json(members);
});

// Delete all data (with key)
app.get("/delete-all", async (req, res) => {
  const { key } = req.query;
  if (key !== "bts") return res.json({ error: "অবৈধ Key ❌" });

  await db.collection("members").deleteMany({});
  await db.collection("installments").deleteMany({});
  res.json({ message: "সকল ডেটা ডিলিট হয়েছে 🗑️" });
});

// Connect to DB and start server
async function start() {
  try {
    await client.connect();
    db = client.db("kisti_app");
    app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
  }
}

start();
