const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, require: true },
    receiver: { type: String, require: true },
    message: { type: String, require: true },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Messages", messageSchema);
