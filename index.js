const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./routes/auth");
const http = require("http");
const { Server } = require("socket.io");
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
  .catch((error) => console.error(error));

app.use("/auth", authRoutes);

// SOCKET LOGIC
io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("join", (username) => {
    socket.join(username);
  });

  socket.on("typing", ({ sender, receiver }) => {
    socket.to(receiver).emit("typing", { sender, receiver });
  });

  socket.on("send_message", async (data) => {
    const msg = await Messages.create({
      sender: data.sender,
      receiver: data.receiver,
      message: data.message,
      delivered: false,
      read: false,
    });

    // send to receiver
    socket.to(data.receiver).emit("receive_message", msg);

    // mark delivered
    await Messages.findByIdAndUpdate(msg._id, { delivered: true });

    // notify sender
    socket.emit("message_delivered", { _id: msg._id });
  });

  socket.on("message_read", async ({ sender, receiver }) => {
    await Messages.updateMany(
      { sender, receiver, read: false },
      { $set: { read: true } }
    );

    socket.to(sender).emit("message_read", { sender: receiver });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
  });
});

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
