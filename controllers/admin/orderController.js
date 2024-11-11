const Order = require('../../models/orderSchema');
const fn = require('../../helpers/functions')

exports.getOrders = async (req, res) => {

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const orders = await Order.find()
                    .populate('billing_address')
                    .skip(skip).limit(limit)
                    .sort({'createdAt':-1})

  const count = await Order.countDocuments();
  const totalPages = Math.ceil(count / limit);

  //console.log('admin',orders[0])
  return res.render('admin/orders',{
    pageName: 'orders',
    orders,
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    order_info: req.session.order_info,
    isAdmin:true
  })
}

exports.changeOrderStatus = async (req,res) => {
  const {order_id, new_status} = req.params
  console.log(order_id, new_status)
  
  await Order.findByIdAndUpdate(order_id,{$set:{order_status:new_status}},{new:true}).then(order => {
    req.session.order_info = fn.sendResponse(201,"success",'success','Operation success!')
    res.redirect('/admin/orders')
  }).catch(err => {
    console.log(err)
    req.session.order_info = fn.sendResponse(500,"error",'error','Operation Failed!')
    res.redirect('/admin/orders')
  })

}

exports.clearSession = (req, res) => {
  const {status} = req.params
  const {redirect, destroy} = req.query
  if(status == 201){
    req.session.order_info = null
    return res.redirect(`/${redirect}`)
  }else{
    //console.log(destroy)
    if(destroy) req.session.signup_info = null
    if(redirect) return res.redirect(`/${redirect}`)
  }
}