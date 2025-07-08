const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const mongoUri = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let db, members;

MongoClient.connect(mongoUri, { useUnifiedTopology: true })
  .then((client) => {
    db = client.db("loanApp");
    members = db.collection("members");
    app.listen(PORT, () => {
      console.log("✅ Server running on port", PORT);
    });
  })
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

function generateMemberId() {
  return Math.floor(Math.random() * (2020 - 1010 + 1)) + 1010;
}

// ✅ Add new member
app.post("/add-member", async (req, res) => {
  try {
    const { name, phone, nid, loanAmount, weeklyInstallments } = req.body;

    if (!name || !phone || !nid || !loanAmount || !weeklyInstallments) {
      return res.status(400).json({ error: "সব ফিল্ড পূরণ করুন।" });
    }

    const id = generateMemberId();
    const totalPayable = Number(loanAmount);
    const weeklyInstallment = Math.ceil(loanAmount / weeklyInstallments);

    const newMember = {
      id,
      name,
      phone,
      nid,
      loan: {
        amount: Number(loanAmount),
        totalPayable,
        weeklyInstallment,
        totalWeeks: Number(weeklyInstallments),
      },
      installments: [],
    };

    await members.insertOne(newMember);

    res.json({ message: "মেম্বার সফলভাবে যুক্ত হলো।", memberId: id });
  } catch (err) {
    res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে।" });
  }
});

// ✅ Get all members
app.get("/all-members", async (req, res) => {
  try {
    const all = await members.find({}).toArray();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: "ডাটাবেস থেকে ডাটা আনার সময় সমস্যা।" });
  }
});

// ✅ Get single member status & installments
app.get("/status/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const member = await members.findOne({ id });
    if (!member) return res.status(404).json({ error: "মেম্বার পাওয়া যায়নি।" });

    const totalPaid = member.installments.reduce((sum, i) => sum + i.amount, 0);
    const remaining = member.loan.totalPayable - totalPaid;

    res.json({
      id,
      name: member.name,
      phone: member.phone,
      nid: member.nid,
      loan: member.loan,
      installments: member.installments,
      totalPaid,
      remaining,
    });
  } catch {
    res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে।" });
  }
});

// ✅ Add weekly installment
app.get("/add-installment", async (req, res) => {
  try {
    const { memberId, weekNo, amount } = req.query;
    const id = Number(memberId);
    const week = Number(weekNo);
    const pay = Number(amount);

    if (!id || !week || !pay) {
      return res.status(400).json({ error: "সঠিক ডাটা পাঠান।" });
    }
    if (week < 1 || week > 40) {
      return res.status(400).json({ error: "সপ্তাহ নম্বর ১ থেকে ৪০ এর মধ্যে হতে হবে।" });
    }

    const member = await members.findOne({ id });
    if (!member) return res.status(404).json({ error: "মেম্বার পাওয়া যায়নি।" });

    // ✅ Check previous weeks paid
    for (let w = 1; w < week; w++) {
      const inst = member.installments.find(i => i.weekNo === w);
      if (!inst) {
        return res.status(400).json({ error: `সপ্তাহ ${w} এর কিস্তি পরিশোধ করা হয়নি। আগে সেটি পরিশোধ করুন।` });
      }
    }

    // ✅ Check if already paid this week
    const exists = member.installments.find(i => i.weekNo === week);
    if (exists) return res.status(409).json({ error: "এই সপ্তাহের কিস্তি ইতোমধ্যে পরিশোধ করা হয়েছে।" });

    await members.updateOne(
      { id },
      { $push: { installments: { weekNo: week, amount: pay, date: new Date() } } }
    );

    res.json({ message: `সপ্তাহ ${week} এর কিস্তি সফলভাবে যোগ করা হয়েছে।` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে।" });
  }
});

// ✅ Delete all members (with key security)
app.delete("/delete-all-members", async (req, res) => {
  const key = req.query.key;
  if (key !== "bts") {
    return res.status(403).json({ error: "অনুমতি নেই! ভুল key।" });
  }
  try {
    await members.deleteMany({});
    res.json({ message: "✅ সফলভাবে সব মেম্বার ডিলিট করা হলো।" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ডিলিট করতে সমস্যা হয়েছে।" });
  }
});
