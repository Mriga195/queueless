const express = require('express');
const ratingController = require('./../controllers/ratingController');
const authController = require('./../controllers/authController');

const router = express.Router({ mergeParams: true });

router
  .route('/')
  .get(ratingController.getAllRatings)
  .post(
    authController.protect,
    authController.restrictTo('student'),
    ratingController.setMenuItemUserIds,
    ratingController.checkCollected,
    ratingController.createRating
  );

router
  .route('/:id')
  .get(ratingController.getRating)
  .patch(
    authController.protect,
    authController.restrictTo('student'),
    ratingController.checkOwner,
    ratingController.onlyRatingAndComment,
    ratingController.updateRating
  )
  .delete(
    authController.protect,
    authController.restrictTo('student', 'admin'),
    ratingController.checkOwner,
    ratingController.deleteRating
  );

module.exports = router;
