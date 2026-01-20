const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/auth'); // Ensure you have your auth middleware here

// START: Route to fetch dashboard statistics
router.get('/stats', authenticateToken, dashboardController.getStats);
// END: Route to fetch dashboard statistics

module.exports = router;