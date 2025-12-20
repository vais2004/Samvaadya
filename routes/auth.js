const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const dotenv = require("dotenv");
const router = express.Router();
dotenv.config();

const JWT_SECRETKEY = process.env.JWT_SECRET;

router.post("register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (!existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists. Please Login" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username: username,
      password: bcrypt.hashedPassword,
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRETKEY, {
      expiresIn: "4hr",
    });
    res.status(201).json({ token, username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error });
  }
});
