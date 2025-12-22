const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const dotenv = require("dotenv");
const router = express.Router();
dotenv.config();

const JWT_SECRETKEY = process.env.JWT_SECRET;

router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists. Please Login" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username: username,
      password: hashedPassword,
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRETKEY, {
      expiresIn: "4hr",
    });
    res
      .status(201)
      .json({ message: "User registered successfully.", token, username });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Server Error while registering user.", error: error });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }
    res
      .status(200)
      .status({ message: "Login successfully", username: user.username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error while login", error: error });
  }
});

module.exports = router;
