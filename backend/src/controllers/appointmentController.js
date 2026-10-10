const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");

const createAppointment = async (req, res) => {
  try {
    const { patient, doctor, appointmentDate, reason } = req.body;

    if (!mongoose.isValidObjectId(patient) ||
        !mongoose.isValidObjectId(doctor)) {
      return res.status(400).json({
        success: false,
        message: "Valid patient and doctor IDs are required",
      });
    }

    const date = new Date(appointmentDate);

    if (!appointmentDate || Number.isNaN(date.getTime()) ||
        date <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Appointment date must be a valid future date",
      });
    }

    if (typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Appointment reason is required",
      });
    }

    const [existingPatient, existingDoctor] = await Promise.all([
      Patient.findById(patient),
      Doctor.findById(doctor),
    ]);

    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    if (!existingDoctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    if (!existingDoctor.available) {
      return res.status(400).json({
        success: false,
        message: "Doctor is currently unavailable",
      });
    }

    const appointment = await Appointment.create({
      patient,
      doctor,
      appointmentDate: date,
      reason: reason.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      data: appointment,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to book appointment",
    });
  }
};

const getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate("patient", "name email phone")
      .populate("doctor", "name specialization")
      .sort({ appointmentDate: 1 });

    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch appointments",
    });
  }
};

const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await Appointment.findById(id)
      .populate("patient", "name email phone")
      .populate("doctor", "name specialization");

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch appointment",
    });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { patient, doctor, appointmentDate, reason, status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const updates = {};

    if (patient !== undefined) {
      if (!mongoose.isValidObjectId(patient)) {
        return res.status(400).json({
          success: false,
          message: "Invalid patient ID",
        });
      }

      if (!(await Patient.exists({ _id: patient }))) {
        return res.status(404).json({
          success: false,
          message: "Patient not found",
        });
      }

      updates.patient = patient;
    }

    if (doctor !== undefined) {
      if (!mongoose.isValidObjectId(doctor)) {
        return res.status(400).json({
          success: false,
          message: "Invalid doctor ID",
        });
      }

      const existingDoctor = await Doctor.findById(doctor);

      if (!existingDoctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor not found",
        });
      }

      if (!existingDoctor.available) {
        return res.status(400).json({
          success: false,
          message: "Doctor is currently unavailable",
        });
      }

      updates.doctor = doctor;
    }

    if (appointmentDate !== undefined) {
      const date = new Date(appointmentDate);

      if (Number.isNaN(date.getTime()) || date <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Appointment date must be a valid future date",
        });
      }

      updates.appointmentDate = date;
    }

    if (reason !== undefined) {
      if (typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({
          success: false,
          message: "Reason cannot be empty",
        });
      }

      updates.reason = reason.trim();
    }

    if (status !== undefined) {
      if (!["Scheduled", "Completed", "Cancelled"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment status",
        });
      }

      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
      .populate("patient", "name email phone")
      .populate("doctor", "name specialization");

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment updated successfully",
      data: appointment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update appointment",
    });
  }
};


const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (appointment.status === "Completed") {
      return res.status(400).json({
        success: false,
        message: "Completed appointments cannot be cancelled",
      });
    }

    if (appointment.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Appointment is already cancelled",
      });
    }

    appointment.status = "Cancelled";
    await appointment.save();

    return res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
      data: appointment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to cancel appointment",
    });
  }
};

module.exports = {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment,
  cancelAppointment,
};
