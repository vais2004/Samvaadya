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
  console.log("Connected socket:", socket.id);

  socket.on("join", (username) => {
    console.log("User joined:", username);
    socket.join(username);
  });

  // Typing indicator
  socket.on("typing", ({ sender, receiver }) => {
    console.log(`${sender} is typing to ${receiver}`);
    socket.to(receiver).emit("typing", sender);
  });

  // Send message
  socket.on("send_message", async ({ sender, receiver, message }) => {
    console.log("send_message received:", sender, receiver, message);
    try {
      const msg = new Messages({
        sender,
        receiver,
        message,
        delivered: false,
        read: false,
      });
      await msg.save();
      console.log("Message saved in DB:", msg);

      // Emit to receiver
      socket.to(receiver).emit("receive_message", msg);
      console.log("Message sent to receiver:", receiver);

      // Update delivered
      await Messages.findByIdAndUpdate(msg._id, { delivered: true });
      console.log("Message marked delivered:", msg._id);

      // Notify sender
      socket.emit("message_delivered", msg._id);
    } catch (err) {
      console.error("Error in send_message:", err);
    }
  });

  // Mark messages as read
  socket.on("message_read", async ({ sender, receiver }) => {
    console.log("message_read event:", sender, receiver);
    try {
      const updated = await Messages.updateMany(
        { sender, receiver, read: false },
        { $set: { read: true } }
      );
      console.log("Messages updated as read:", updated.modifiedCount);

      const readMsgs = await Messages.find({
        sender,
        receiver,
        read: true,
      }).select("_id");
      console.log(
        "Read message IDs:",
        readMsgs.map((m) => m._id)
      );

      // Notify sender
      socket.to(sender).emit(
        "messages_read",
        readMsgs.map((m) => m._id.toString())
      );
    } catch (err) {
      console.error("Error marking messages read:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

/* ================= API ================= */
app.get("/messages", async (req, res) => {
  const { sender, receiver } = req.query;
  try {
    const messages = await Messages.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
    }).sort({ createdAt: 1 });

    console.log("Fetched messages:", messages.length);
    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.get("/users", async (req, res) => {
  const { currentUser } = req.query;
  try {
    const users = await User.find({ username: { $ne: currentUser } });
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
