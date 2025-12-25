const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    sender: { type: String, required: true },
    receiver: { type: String, required: true },
    message: { type: String, required: true },
    delivered: {
      type: Boolean,
      default: false,
      required: true, // Add this
    },
    read: {
      type: Boolean,
      default: false,
      required: true, // Add this
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Messages", MessageSchema);
