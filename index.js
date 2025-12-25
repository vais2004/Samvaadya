const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

const Messages = require("./models/Messages");
const User = require("./models/User");
const authRoutes = require("./routes/auth");

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(console.error);

app.use("/auth", authRoutes);

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (username) => {
    socket.join(username);
  });

  socket.on("typing", ({ sender, receiver }) => {
    socket.to(receiver).emit("typing", { sender });
  });

  /* ---------- SEND MESSAGE ---------- */
  socket.on("send_message", async (data) => {
    const newMessage = await Messages.create({
      sender: data.sender,
      receiver: data.receiver,
      message: data.message,
      delivered: false,
      read: false,
    });

    // receiver gets message
    socket.to(data.receiver).emit("receive_message", newMessage);

    // mark delivered
    await Messages.findByIdAndUpdate(newMessage._id, {
      delivered: true,
    });

    // sender gets delivery update
    socket.emit("message_delivered", { _id: newMessage._id });
  });

  /* ---------- READ MESSAGE ---------- */
  socket.on("message_read", async ({ sender, receiver }) => {
    await Messages.updateMany(
      { sender, receiver, read: false },
      { $set: { read: true } }
    );

    socket.to(sender).emit("message_read", { sender: receiver });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

/* ================= API ================= */
app.get("/messages", async (req, res) => {
  const { sender, receiver } = req.query;

  const messages = await Messages.find({
    $or: [
      { sender, receiver },
      { sender: receiver, receiver: sender },
    ],
  }).sort({ createdAt: 1 });

  res.json(messages);
});

app.get("/users", async (req, res) => {
  const { currentUser } = req.query;
  const users = await User.find({ username: { $ne: currentUser } });
  res.json(users);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
