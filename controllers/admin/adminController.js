const Admin = require('../../models/adminModel');
const User = require('../../models/userModel');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const fn = require('../../helpers/functions');
const moment = require('moment');

/* Auth */
exports.getLogin = async (req, res) => {
  res.render('admin/login', { errors: req.session.info, layout: 'admin/login' })
}

exports.doLogin = async (req, res) =>{
  try {
    
    const {email,password} = req.body
    if(email.trim().length < 1){
      req.session.info = {status:400, pass:password, email:'Please enter your email'}
      return res.redirect('/admin/login');

    }

    if(password.trim().length < 1){
      req.session.info = {status:400, mail:email, password:'Please enter the password'}
      return res.redirect('/admin/login');
    }
      
    const admin = await Admin.findOne({email})
    
    if(!admin) {
      req.session.info = {status:404, mail:email, pass:password, msg:'Account does not exists'}
      return res.redirect('/admin/login');
    }

    if(admin.password !== password){
      req.session.info = {status:401, mail:email, msg:'Incorrect password'}
      return res.redirect('/admin/login');
    }

    req.session.admin = true
    req.session.info = {admin, pageName: 'dashboard'}
    
    res.redirect('/admin/dashboard')

  } catch (error) {
    
  }
}

exports.getDashboard = (req, res) => {
  res.render('admin/dashboard',{pageName: 'dashboard', data: req.session.info, isAdmin:true})
}

exports.getUsers = async (req, res) => {

  const users = await User.find().populate("default_address",["city","state","country"]);
  const userData = await Promise.all(users.map( async user => {
    const orders = await Order.find({user_id: user._id})
    return {
      ...user.toObject(),
      orders: orders.length
    }
  }))

  res.render('admin/users',{
    pageName: 'users',
    users: userData,
    isAdmin:true
  })
}

exports.blockUser = async (req,res) => {
  const {id} = req.params
  await User.findOneAndUpdate({_id:id},{
    $set:{isBlocked:true,user_status: 'blocked'}
  }).then(() => {
    req.session.user = null
    req.session.user_info = fn.sendResponse(200,'Success!','success','User blocked successfully')
  }).catch(err => {
    console.log(err);
    req.session.user_info = fn.sendResponse(400,'Error!','error','Some thing went wrog, Try again.')
  })

  return res.redirect('/admin/users')
}

exports.unblockUser = async (req,res) => {
  const {id} = req.params

  await User.findOneAndUpdate({_id:id},{
    $set:{isBlocked:false,user_status: 'active'}
  }).then(() => {
    req.session.user_info = fn.sendResponse(200,'Success!','success','User unblocked successfully')
  }).catch(err => {
    console.log(err);
    req.session.user_info = fn.sendResponse(400,'Error!','error','Some thing went wrog, Try again.')
  })

  return res.redirect('/admin/users')
}

exports.logout = (req,res) => {
  req.session.destroy()
  return res.redirect('/admin/login')
}

exports.clearSession = (req, res) => {
  const {status} = req.params
  const {redirect, destroy} = req.query
  if(status == 201){
    req.session.user_info = null
    return res.redirect(`/${redirect}`)
  }else{
    //console.log(destroy)
    if(destroy) req.session.signup_info = null
    if(redirect) return res.redirect(`/${redirect}`)
  }
}