const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const dotenv = require("dotenv");
const authRoutes = require("./routes/auth");
const { Server } = require("socket.io");

const Messages = require("./models/Messages");
const User = require("./models/User");

dotenv.config();
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Mongodb connected."))
  .catch((error) => console.error(error));

// socket io logic
const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  // Register connected user
  socket.on("register", (username) => {
    connectedUsers[username] = socket.id;
    console.log(`User registered: ${username} (${socket.id})`);
  });

  // Message send logic
  socket.on("send_message", async (data) => {
    const { sender, receiver, message } = data;
    const newMessage = new Messages({
      sender,
      receiver,
      message,
      status: "sent",
    });
    const savedMessage = await newMessage.save();

    const messageWithTime = {
      _id: savedMessage._id,
      sender,
      receiver,
      message,
      status: savedMessage.status,
      createdAt: savedMessage.createdAt,
    };

    // Send message only to receiver
    const receiverSocket = connectedUsers[receiver];
    if (receiverSocket) {
      io.to(receiverSocket).emit("receive_message", messageWithTime);

      //update status to delivered
      savedMessage.status = "delivered";
      await savedMessage.save();

      // Notify sender that the message was sent (single tick)
      io.to(socket.id).emit("message_status_update", {
        messageId: savedMessage._id,
        status: "delivered",
      });
    } else {
      // Receiver offline → keep it as "sent"
      io.to(socket.id).emit("message_status_update", {
        messageId: savedMessage._id,
        status: "sent",
      });
    }
  });

  // Typing indicators
  socket.on("typing", ({ sender, receiver }) => {
    const receiverSocket = connectedUsers[receiver];
    if (receiverSocket) io.to(receiverSocket).emit("user_typing", { sender });
  });

  socket.on("stop_typing", ({ sender, receiver }) => {
    const receiverSocket = connectedUsers[receiver];
    if (receiverSocket)
      io.to(receiverSocket).emit("user_stop_typing", { sender });
  });

  // Read receipts (double tick)
  socket.on("message_read", async ({ messageId, reader }) => {
    const msg = await Messages.findById(messageId);
    if (msg && msg.receiver === reader) {
      msg.status = "read";
      await msg.save();

      const senderSocket = connectedUsers[msg.sender];
      if (senderSocket)
        io.to(senderSocket).emit("message_read_update", {
          messageId,
          status: "read",
        });
    }
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    for (const user in connectedUsers) {
      if (connectedUsers[user] === socket.id) delete connectedUsers[user];
    }
    console.log("User disconnected", socket.id);
  });
});

app.get("/messages", async (req, res) => {
  const { sender, receiver } = req.query;
  try {
    const messages = await Messages.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages" });
  }
});

app.get("/users", async (req, res) => {
  const { currentUser } = req.query;
  try {
    const users = await User.find({ username: { $ne: currentUser } });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.use("/auth", authRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
