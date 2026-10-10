const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const MenuItem = require('./../../models/menuItemModel');
const User = require('./../../models/userModel');
const Order = require('./../../models/orderModel');
const Rating = require('./../../models/ratingModel');

dotenv.config({ path: './config.env' });

mongoose
  .connect(process.env.DATABASE)
  .then(() => console.log('DB connection successful!'));

const menu = JSON.parse(fs.readFileSync(`${__dirname}/menu.json`, 'utf-8'));
const users = JSON.parse(fs.readFileSync(`${__dirname}/users.json`, 'utf-8'));

const importData = async () => {
  try {
    await MenuItem.create(menu);
    await User.create(users);
    console.log('Data successfully loaded!');
  } catch (err) {
    console.log(err);
  }
  process.exit();
};

const deleteData = async () => {
  try {
    await MenuItem.deleteMany();
    await User.deleteMany();
    await Order.deleteMany();
    await Rating.deleteMany();
    console.log('Data successfully deleted!');
  } catch (err) {
    console.log(err);
  }
  process.exit();
};

if (process.argv[2] === '--import') {
  importData();
} else if (process.argv[2] === '--delete') {
  deleteData();
}
