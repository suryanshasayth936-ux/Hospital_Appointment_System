const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Token missing.',
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('Server Configuration Error: JWT_SECRET is not defined in environment variables.');
      return res.status(500).json({
        success: false,
        message: 'Authentication service misconfigured: JWT_SECRET is not defined',
      });
    }

    const decoded = jwt.verify(token, secret);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
      error: error.message,
    });
  }
};

module.exports = authMiddleware;