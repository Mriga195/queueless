const express = require('express');
const menuController = require('./../controllers/menuController');
const authController = require('./../controllers/authController');
const ratingRouter = require('./../routes/ratingRoutes');

const router = express.Router();

router.use('/:menuItemId/ratings', ratingRouter);

router
  .route('/')
  .get(
    authController.isLoggedIn,
    menuController.hideSoldOutForStudents,
    menuController.getAllItems
  )
  .post(
    authController.protect,
    authController.restrictTo('admin'),
    menuController.uploadItemImage,
    menuController.resizeItemImage,
    menuController.createItem
  );

router
  .route('/:id')
  .get(menuController.getItem)
  .patch(
    authController.protect,
    authController.restrictTo('staff', 'admin'),
    menuController.uploadItemImage,
    menuController.staffCanOnlyChangeAvailability,
    menuController.resizeItemImage,
    menuController.updateItem
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin'),
    menuController.deleteItem
  );

module.exports = router;
