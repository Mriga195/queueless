const Order = require('./../models/orderModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');

exports.getSalesReport = catchAsync(async (req, res, next) => {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (isNaN(from) || isNaN(to)) {
    return next(new AppError('Please give dates as YYYY-MM-DD.', 400));
  }

  to.setUTCHours(23, 59, 59, 999);
  const timezone = process.env.CANTEEN_TIMEZONE;

  const [report] = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        status: { $ne: 'cancelled' },
        createdAt: { $gte: from, $lte: to }
      }
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$totalAmount' },
              totalOrders: { $sum: 1 }
            }
          }
        ],
        byDay: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone
                }
              },
              revenue: { $sum: '$totalAmount' },
              orders: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: '$_id', revenue: 1, orders: 1 } }
        ],
        topItems: [
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.menuItem',
              name: { $first: '$items.name' },
              quantity: { $sum: '$items.quantity' },
              revenue: {
                $sum: { $multiply: ['$items.price', '$items.quantity'] }
              }
            }
          },
          { $sort: { quantity: -1 } },
          { $limit: 10 },
          { $project: { _id: 0, name: 1, quantity: 1, revenue: 1 } }
        ],
        byHour: [
          {
            $group: {
              _id: { $hour: { date: '$createdAt', timezone } },
              orders: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, hour: '$_id', orders: 1 } }
        ]
      }
    }
  ]);

  const totals = report.totals[0] || { totalRevenue: 0, totalOrders: 0 };

  res.status(200).json({
    status: 'success',
    data: {
      totalRevenue: totals.totalRevenue,
      totalOrders: totals.totalOrders,
      byDay: report.byDay,
      topItems: report.topItems,
      byHour: report.byHour
    }
  });
});
