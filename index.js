const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth");
const Messages = require("./models/Messages");
const User = require("./models/User");

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
  .then(() => console.log("Mongoosedb connected"))
  .catch((err) => console.error(err));

app.use("/auth", authRoutes);

/* ================= SOCKET ================= */

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join", (username) => {
    socket.join(username);
  });

  // ✅ Typing indicator
  socket.on("typing", ({ sender, receiver }) => {
    socket.to(receiver).emit("typing", sender);
  });

  // ✅ Send message
  socket.on("send_message", async ({ sender, receiver, message }) => {
    const msg = await Messages.create({
      sender,
      receiver,
      message,
      delivered: false,
      read: false,
    });

    // send to receiver
    socket.to(receiver).emit("receive_message", msg);

    // mark delivered AFTER receiver got it
    await Messages.findByIdAndUpdate(msg._id, { delivered: true });

    // notify sender about delivery
    socket.emit("message_delivered", msg._id);
  });

  // ✅ Mark messages as read
  socket.on("message_read", async ({ sender, receiver }) => {
    const updatedMessages = await Messages.find({
      sender,
      receiver,
      read: false,
    });

    await Messages.updateMany(
      { sender, receiver, read: false },
      { $set: { read: true } }
    );

    // notify sender which messages were read
    socket.to(sender).emit(
      "messages_read",
      updatedMessages.map((m) => m._id)
    );
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
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
