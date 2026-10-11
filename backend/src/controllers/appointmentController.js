const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");

const createAppointment = async (req, res) => {
  try {
    const patient = req.user?.id || req.user?._id || req.body.patient;
    const { doctor, appointmentDate, reason } = req.body;

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

    const [existingDoctorAppointment, existingPatientAppointment] =
      await Promise.all([
        Appointment.findOne({
          doctor,
          appointmentDate: date,
          status: "Scheduled",
        }),
        Appointment.findOne({
          patient,
          appointmentDate: date,
          status: "Scheduled",
        }),
      ]);

    if (existingDoctorAppointment) {
      return res.status(409).json({
        success: false,
        message: "Doctor is already booked for this time slot",
      });
    }

    if (existingPatientAppointment) {
      return res.status(409).json({
        success: false,
        message: "Patient already has an appointment scheduled for this time slot",
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
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Doctor is already booked for this time slot",
      });
    }

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
    const filter = {};

    // 1. Scope to logged-in patient if not admin
    if (req.user?.id || req.user?._id) {
      const userId = req.user.id || req.user._id;
      if (req.user.role !== "admin") {
        filter.patient = userId;
      }
    }

    // 2. Query filter support
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const doctorParam = req.query.doctorId || req.query.doctor;
    if (doctorParam) {
      if (mongoose.isValidObjectId(doctorParam)) {
        filter.doctor = doctorParam;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid doctor ID in filter",
        });
      }
    }

    const startDate = req.query.startDate || req.query.from;
    const endDate = req.query.endDate || req.query.to;
    if (startDate || endDate) {
      filter.appointmentDate = {};
      if (startDate) {
        const sDate = new Date(startDate);
        if (!Number.isNaN(sDate.getTime())) {
          filter.appointmentDate.$gte = sDate;
        }
      }
      if (endDate) {
        const eDate = new Date(endDate);
        if (!Number.isNaN(eDate.getTime())) {
          filter.appointmentDate.$lte = eDate;
        }
      }
    }

    // 3. Pagination parameters with defaults
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [total, appointments] = await Promise.all([
      Appointment.countDocuments(filter),
      Appointment.find(filter)
        .populate("patient", "firstName lastName name email phone")
        .populate("doctor", "firstName lastName name specialization consultationFee")
        .sort({ appointmentDate: 1 })
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      count: appointments.length,
      total,
      page,
      totalPages,
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
      .populate("patient", "firstName lastName name email phone")
      .populate("doctor", "firstName lastName name specialization consultationFee");

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Ownership check: Verify logged-in user owns the appointment
    const userId = req.user?.id || req.user?._id;
    const apptPatientId = appointment.patient?._id
      ? appointment.patient._id.toString()
      : appointment.patient?.toString();

    if (userId && apptPatientId !== userId.toString() && req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own appointments",
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
    const { doctor, appointmentDate, reason, status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const existingAppointment = await Appointment.findById(id);

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Ownership check: Verify logged-in user owns the appointment
    const userId = req.user?.id || req.user?._id;
    if (userId && existingAppointment.patient.toString() !== userId.toString() && req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own appointments",
      });
    }

    const updates = {};

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

    const targetDoctor = updates.doctor || existingAppointment.doctor;
    const targetPatient = existingAppointment.patient;
    const targetDate = updates.appointmentDate || existingAppointment.appointmentDate;
    const targetStatus = updates.status || existingAppointment.status;

    if (targetStatus === "Scheduled" && (updates.appointmentDate || updates.doctor)) {
      const [existingDoctorAppointment, existingPatientAppointment] =
        await Promise.all([
          Appointment.findOne({
            _id: { $ne: id },
            doctor: targetDoctor,
            appointmentDate: targetDate,
            status: "Scheduled",
          }),
          Appointment.findOne({
            _id: { $ne: id },
            patient: targetPatient,
            appointmentDate: targetDate,
            status: "Scheduled",
          }),
        ]);

      if (existingDoctorAppointment) {
        return res.status(409).json({
          success: false,
          message: "Doctor is already booked for this time slot",
        });
      }

      if (existingPatientAppointment) {
        return res.status(409).json({
          success: false,
          message: "Patient already has an appointment scheduled for this time slot",
        });
      }
    }

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      updates,
      { returnDocument: "after", runValidators: true }
    )
      .populate("patient", "firstName lastName name email phone")
      .populate("doctor", "firstName lastName name specialization");

    return res.status(200).json({
      success: true,
      message: "Appointment updated successfully",
      data: appointment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Doctor is already booked for this time slot",
      });
    }

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

    // Ownership check: Verify logged-in user owns the appointment
    const userId = req.user?.id || req.user?._id;
    if (userId && appointment.patient.toString() !== userId.toString() && req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only cancel your own appointments",
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
