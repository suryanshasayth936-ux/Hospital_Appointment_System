
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { createAppointment } = require('../controllers/appointmentController');

router.post('/book', authMiddleware, createAppointment);

module.exports = router;
