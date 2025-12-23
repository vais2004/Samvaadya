const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const UsersSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

UsersSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const Users = mongoose.model("Users", UsersSchema);
module.exports = Users;
