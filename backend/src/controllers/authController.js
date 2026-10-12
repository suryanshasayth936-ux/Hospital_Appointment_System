
const Patient = require("../models/Patient");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerPatient = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, dateOfBirth, gender, address } = req.body;

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !password ||
      !phone?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, password, and phone are required",
      });
    }

    if (!dateOfBirth) {
      return res.status(400).json({
        success: false,
        message: "Date of birth is required",
      });
    }

    const parsedDob = new Date(dateOfBirth);
    if (Number.isNaN(parsedDob.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date of birth format",
      });
    }

    if (!gender || !["Male", "Female", "Other"].includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Gender is required and must be Male, Female, or Other",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingPatient = await Patient.findOne({
      email: normalizedEmail,
    });

    if (existingPatient) {
      return res.status(400).json({
        success: false,
        message: "A patient with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Save the patient (without unmodeled 'name' property)
    const patient = await Patient.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone.trim(),
      dateOfBirth: parsedDob,
      gender,
      ...(address && { address: address.trim() }),
    });

    const patientResponse = patient.toObject();
    delete patientResponse.password;

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully",
      data: patientResponse,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A patient with this email already exists",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message).join(", ");
      return res.status(400).json({
        success: false,
        message: messages || error.message,
      });
    }

    console.error("Patient registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to register patient",
    });
  }
};

const loginPatient = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const patient = await Patient.findOne({ email: normalizedEmail }).select("+password");

    if (!patient) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, patient.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const secret = process.env.JWT_SECRET || "supersecretjwtkey_hospital_app_12345";
    const token = jwt.sign(
      { id: patient._id, role: "patient" },
      secret,
      { expiresIn: "7d" }
    );

    const patientResponse = patient.toObject();
    delete patientResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: patientResponse,
    });
  } catch (error) {
    console.error("Patient login error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to log in",
    });
  }
};

module.exports = { registerPatient, loginPatient };
