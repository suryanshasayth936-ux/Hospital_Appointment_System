require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');

const app = express();

// Database connect server start hone se pehle ya start par
connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});