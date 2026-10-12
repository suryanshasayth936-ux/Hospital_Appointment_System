const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error(
      'Database Configuration Error: MONGO_URI is not defined in environment variables. Please check your .env file.'
    );
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;