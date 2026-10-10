const express = require('express');
const reportController = require('./../controllers/reportController');
const authController = require('./../controllers/authController');

const router = express.Router();

router.use(authController.protect, authController.restrictTo('admin'));

router.get('/sales', reportController.getSalesReport);

module.exports = router;
