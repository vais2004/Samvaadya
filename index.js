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

  // ✅ Send message - SIMPLIFIED VERSION
  socket.on("send_message", async ({ sender, receiver, message }) => {
    try {
      // Create message with all fields explicitly
      const msg = new Messages({
        sender,
        receiver,
        message,
        delivered: true, // Mark as delivered when saved to server
        read: false,
      });

      await msg.save();

      console.log("Message saved to DB:", {
        _id: msg._id,
        delivered: msg.delivered,
        read: msg.read,
      });

      // Send to receiver
      socket.to(receiver).emit("receive_message", msg);

      // Notify sender immediately
      socket.emit("message_delivered", msg._id);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  // ✅ Mark messages as read - SIMPLIFIED
  socket.on("message_read", async ({ sender, receiver }) => {
    try {
      console.log("Marking messages as read from", sender, "to", receiver);

      // Update all messages from sender to receiver
      const result = await Messages.updateMany(
        {
          sender: sender,
          receiver: receiver,
          read: false,
        },
        { $set: { read: true } }
      );

      console.log("Updated", result.modifiedCount, "messages as read");

      // Get the message IDs that were updated
      const updatedMessages = await Messages.find({
        sender: sender,
        receiver: receiver,
        read: true,
      }).select("_id");

      // Notify sender
      socket.to(sender).emit(
        "messages_read",
        updatedMessages.map((m) => m._id.toString())
      );
    } catch (error) {
      console.error("Error marking messages as read:", error);
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
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.get("/users", async (req, res) => {
  const { currentUser } = req.query;
  try {
    const users = await User.find({ username: { $ne: currentUser } });
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
