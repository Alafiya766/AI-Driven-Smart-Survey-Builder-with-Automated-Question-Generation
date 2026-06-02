const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
  const header = req.headers['authorization'];
  const token  = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Only admin
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
};

// Admin OR creator
const creatorOrAdmin = (req, res, next) => {
  if (!['admin','creator'].includes(req.user?.role))
    return res.status(403).json({ message: 'Creator or Admin access required' });
  next();
};

// Admin OR creator OR respondent (any authenticated)
const anyRole = (req, res, next) => next();

module.exports = { authMiddleware, adminOnly, creatorOrAdmin, anyRole };
