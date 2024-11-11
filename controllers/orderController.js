
const Product = require('../models/productModel');
const Offer = require('../models/offerSchema');
const Coupon = require('../models/couponSchema');
const User = require('../models/userModel')
const fn = require('../helpers/functions');
const Order = require('../models/orderSchema');
const Address = require('../models/addressModel');
const Transaction = require('../models/transactionModel');
const constants = require('../constants/constants')
require('dotenv').config()
const razorpay = require('razorpay');
const {validateWebhookSignature} = require('razorpay/dist/utils/razorpay-utils');
const { createInvoice } = require('../helpers/invoice')

const instance = new razorpay({ 
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
  currency: 'INR'
})

exports.getWishlist = async (req, res) => {

  const wishlist = await User.findById(req.session.user._id).then(user => user.wishlist)
  const productsWithOffer = await Promise.all(wishlist.map(async item => {
    const newItem = {
      _id: item._id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      product: await fn.getProductsWithOffers(item.product)
    }
    return newItem
  }))
  //console.log(productsWithOffer)

  //console.log(wishlist)
  res.render('user/wishlist',{
    isLogged: constants.isLogged,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: productsWithOffer,
    isAdmin: false
  })
}

exports.addOrRemoveWishlist = async (req, res) => {
  //console.log(req.body)
  const {product} = req.body
  
  const user = await User.findOne({ _id: req.session.user._id });
  
  if (!user) {
    return res.send(fn.createToast(false, 'error', 'Please login to use wishlist.'));
  }

  const wishlist = user.wishlist || [];
  const productIndex = wishlist.findIndex(item => item.product.toString() === product);
  let removed = false
  if (productIndex !== -1) {
    wishlist.splice(productIndex, 1);
    removed = true;
  } else {
    wishlist.push({ product });
  }

  const popMessage = 'Product '+ (removed ? 'removed from' : 'added to') +' wishlist';

  user.wishlist = wishlist;

  await user.save().then(() => {
    res.send(fn.createToast(true, 'success', popMessage,null,{removed,count:wishlist.length}))
  }).catch(err => {
    console.log(err)
    res.send(fn.createToast(false, 'error', 'Some error occurred, Try again.'))
  })
  
}

exports.removeFromWishlist = async (req, res) => {

  const {item_id} = req.params
  const wishlist = await User.findById(req.session.user._id).populate('wishlist').then(user => user.wishlist)
  let deletedIndex = -1

  const filtered = wishlist.filter((item,index) => {
    if(item._id.toString() === item_id) deletedIndex = index
    return item._id.toString() !== item_id
  })

  await User.findOneAndUpdate({_id:req.session.user._id},{
    $set: {wishlist: filtered}
  }).then(async ()=>{
    return res.send({success:true, deletedIndex: deletedIndex, wishlist_count: filtered.length})
  }).catch(err => {
    console.log(err)
    return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
  })

}

exports.getCart = async (req, res) => {
  
  const {cartItems, subtotal, tax, discounts, total} = await fn.getCartItmes(req.session.user._id);
  /* const products = await Product.find()
  products.map(async product => {
    await Product.findOneAndUpdate({_id:product._id},{
      $set: {max_quantity: Math.max(1,Math.min(Math.floor(product.stock / 3),10))},
    })
  }) */
  //console.log(discounts)

  res.render('user/cart',{
    isLogged: constants.isLogged,
    cartItems,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: await fn.getWishlistItems(req.session.user._id),
    subtotal,
    tax,
    discounts,
    total: total,
    isAdmin: false,
  })
}

exports.addToCart = async (req, res) => {
  
  const {product_id, product_count} = req.body;
  let {increase,decrease,quantity} = req.query;
  
  let user = await User.findOne({_id:req.session.user._id}).populate('cart')
  let cart = user.cart
  
  if(cart){
    const existingItem = cart.find(el => el.item === product_id);
    // reassign quantity here for updating stock in product
    //console.log('existingItem', existingItem)
    if (existingItem) {
      if(increase){
        existingItem.quantity += 1;
        quantity = -1;
      }else if(decrease && existingItem.quantity > 1) {
        existingItem.quantity -= 1;
        quantity = 1;
      }
      else if(quantity && quantity > 0){
        const tempQty = existingItem.quantity;
        existingItem.quantity = quantity;
        quantity = -(quantity - tempQty);
      }
    } else {
      //console.log('new item',product_id)
      cart.push({ item: product_id, quantity: 1 });
      quantity = -1;
    }
  }else{
    cart = [{
      item: product_id,
      quantity: 1
    }]
    quantity = -1;
  }

  //console.log('cart',cart)
  user.cart = cart;

  const cartItems = await Promise.all(cart.map(async (cartItem) => {
    const product = await Product.findById(cartItem.item)
    const offers = await Offer.find(
      {
        offer_status:'active',
        $or:[
          {applied_products:{$in:[product._id]}},
          {applied_categories:{$in:[product.category._id]}}
        ],
      },
      {discount_type: 1, discount_value:1, offer_type: 1}
    )
    const offer_value = offers.reduce((acc, curr) => {
      if(curr.discount_type === 'fixed'){
        return acc + curr.discount_value
      }else if(curr.discount_type === 'percentage'){
        return acc + ((curr.discount_value/100) * product.pricing.original_price)
      }
      return 0
    },0)

    return {
      stock: product.stock,
      max_quantity: product.max_quantity,
      quantity: cartItem.quantity,
      item_tax: product.tax * cartItem.quantity,
      item_total: (product.pricing.original_price * cartItem.quantity) - (offer_value * cartItem.quantity),
      offer_value : (offer_value * cartItem.quantity),
      offer_count: offers.length
    };
  }));


  const outOfStock = cartItems.find((item) => item.quantity > item.stock) 

  const maxQuantityReached = cartItems.find((item) => item.quantity > item.max_quantity)

  // quantity added here to detect if it is button click or input change
  if(outOfStock){
    return res.send(fn.createToast(false, 'error', 'This product is out of stock',quantity))
  }

  if(maxQuantityReached){
    return res.send(fn.createToast(false, 'error', 'You already added max.quantity of this product in your cart.',quantity))
  }

  //console.log(quantity)

  const subtotal = cartItems.reduce((acc, curr) => acc + curr.item_total, 0);
  const tax = cartItems.reduce((acc, curr) => acc + curr.item_tax, 0).toFixed(2);
  const discounts = cartItems.reduce((acc, curr) => acc + curr.offer_value, 0).toFixed(2);

  // passed the cartItems here to reset the values of input fields
  await Product.findByIdAndUpdate({_id:product_id}, {$inc: {stock: quantity}}, {new: true}).then(async () => {
    await user.save().then(()=>{
      return res.send(fn.createToast(true,'success', 'Product added to cart successfully',null,{
        cart:cartItems,
        subtotal,
        tax,
        discounts,
        total: (parseFloat(subtotal) + parseFloat(tax) - discounts).toFixed(2),
        cart_count: cart.reduce((acc, curr) => acc + curr.quantity, 0)
      }))  
    }).catch(err => {
      console.log(err)
      return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
    })
  }).catch(err => {
    console.log(err)
    return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
  })

}

exports.removeFromCart = async (req, res) => {
  
  const {cart_id, product_id} = req.params
  const appliedCoupons = req.query.coupons
  const {quantity} = req.query
  const cart = await User.findOne({_id:req.session.user._id})
                    .populate('cart')
                    .then(cart => cart.cart)

  let deletedIndex = -1
  const filtered = cart.filter((item,index) => {
    if(item._id.toString() === cart_id) deletedIndex = index
    return item._id.toString() !== cart_id
  })

  const cartCount = filtered.reduce((acc, curr) => acc + curr.quantity, 0);

  await User.findOneAndUpdate({_id:req.session.user._id},{$set: {cart: filtered}},{new:true})
  .then(async (user)=>{

    let {cartItems, subtotal, discounts, total, tax} = await fn.getCartItmes(req.session.user._id);
  
    if(appliedCoupons){

      const reqCoupons = appliedCoupons.split(',').map(code => code.toUpperCase())
      const exitsSameCoupon = cartItems.filter(item => item.coupons.filter(coupon => reqCoupons.includes(coupon.coupon_code)).length > 0)
      .filter(item => item.product_id.toString() !== product_id)

      if(exitsSameCoupon.length > 0){

        const user = req.session.user;
        const alreadyUsed = user.coupons.filter(coupon => reqCoupons.includes(coupon.coupon_code))

        if(alreadyUsed.length === 0){

          const coupons = await Coupon.find({coupon_code: {$in: reqCoupons}})

          const disc = coupons.reduce((acc, curr) => {
            if(curr.discount_type === 'fixed'){
              return acc + curr.discount_value
            }else if(curr.discount_type === 'percentage'){
              return acc + ((curr.discount_value/100) * total)
            }
            return 0
          },0)

          console.log('disc',disc,discounts,total)
          total = (parseFloat(total) - disc).toFixed(2)
          discounts = (parseFloat(discounts) + disc).toFixed(2)
        }
      }
    }

    await Product.findByIdAndUpdate({_id:product_id}, {$inc: {stock: quantity}}, {new: true}).then(()=>{
      return res.send({success:true, deletedIndex: deletedIndex, cart_count: cartCount,total,discounts,subtotal,tax})
    }).catch(err => {
      console.log(err)
      return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
    })
  }).catch(err => {
    console.log(err)
    return res.send(fn.createToast(false, 'error', 'Internal Server Error'))
  })

}

exports.getCheckout = async (req, res) => {

  let {cartItems, subtotal, tax, discounts, total} = await fn.getCartItmes(req.session.user._id);

  const shipping_address = req.session.shipping_address
  const billing_address = req.session.billing_address
  const couponDiscount = req.session.couponsToApplyDiscount
  
  if(couponDiscount){
    total = total - couponDiscount
    discounts = parseFloat(discounts) + couponDiscount
  } 

  res.render('user/checkout',{
    cartItems,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: await fn.getWishlistItems(req.session.user._id),
    user: await User.findById(req.session.user._id).populate('address_list'),
    isLogged: constants.isLogged,
    shipping_address,
    billing_address,
    subtotal,
    tax,
    total,
    discounts,
    acc_info: req.session.acc_info,
    acc_values: req.session.acc_values,
    states: constants.STATES_INDIA,
    isAdmin: false,
  }) 
}

exports.applyCoupon = async (req, res) => {

  // reset existing coupon
  req.session.couponsToApply = null
  req.session.couponsToApplyDiscount = null

  const {coupon_codes} = req.body;
  if(coupon_codes && coupon_codes.length){
    const reqCoupons = coupon_codes.split(',').map(code => code.toUpperCase())
    const user = req.session.user;
    const alreadyUsed = user.coupons.filter(coupon => reqCoupons.includes(coupon.coupon_code))
    if(alreadyUsed.length > 0){
      return res.send(fn.createToast(false, 'error', 'You have already used this coupon code'))
    }
    const coupons = await Coupon.find({coupon_code: {$in: reqCoupons}})
    const {cartItems, subtotal, discounts, total} = await fn.getCartItmes(req.session.user._id);

    const couponNotEligible = coupons.find(coupon => subtotal < coupon.min_cart_value)
    if(couponNotEligible){
      return res.send(fn.createToast(false, 'error', 'Some of coupons not eligible for this cart amount'))
    }

    const isCouponProductIncluded = cartItems.filter(item => item.coupons.filter(coupon => reqCoupons.includes(coupon.coupon_code)).length > 0)

    if(isCouponProductIncluded.length === 0){
      return res.send(fn.createToast(false, 'error', 'This coupon can\'t apply here'))
    }
    
    const disc = coupons.reduce((acc, curr) => {
      if(curr.discount_type === 'fixed'){
        return acc + curr.discount_value
      }else if(curr.discount_type === 'percentage'){
        return acc + ((curr.discount_value/100) * total)
      }
      return 0
    },0)
    req.session.couponsToApply = coupons
    req.session.couponsToApplyDiscount = disc
    return res.send({success:true, discount: (parseFloat(discounts) + disc).toFixed(2), total: (parseFloat(total) - disc).toFixed(2)})
  }
}

exports.placeOrder = async (req, res) => {

  //const user_id = '6711c46d731d478ccdad43f6'
  const {billing_address, shipping_address, payment_method} = req.body;

  const user = await User.findById(req.session.user._id);

  if(!billing_address || !shipping_address) {
    return res.send(fn.createToast(false,'error', 'Please provide billing and shipping Addresses'))
  }

  let bill_address = await Address.findOne({_id:billing_address});
  let ship_address = await Address.findOne({_id:shipping_address});

  let orderData = req.body;
  orderData.user_id = req.session.user._id;
  orderData.order_no = '#'+fn.generateUniqueId();
  orderData.billing_address = {
    ...bill_address,
    address_type: 'billing',
  } 
  orderData.shipping_address = {
    ...ship_address,
    address_type:'shipping',
  };

  let {cartItems, subtotal, discounts, offers, tax, total} = await fn.getCartItmes(req.session.user._id).catch(err => {
    console.log(err)
  });

  const coupons = req.session.couponsToApply
  const couponDiscount = req.session.couponsToApplyDiscount
  
  if(couponDiscount){
    total = total - couponDiscount
    discounts = parseFloat(discounts) + couponDiscount
  }
  
  orderData.cart = cartItems;
  orderData.order_subtotal = subtotal;
  orderData.coupons = coupons;
  orderData.discounts = discounts;
  orderData.offers = offers;
  orderData.order_total = total;
  orderData.tax = tax;
  const order = new Order(orderData);

  //console.log(order)

  // Payment Method Implementation
  let result, transactions = [];
  if(payment_method === 'razorpay') {
    await instance.orders.create(
      {
        amount: parseInt(orderData.order_total * 100),
        currency: 'INR',
        receipt: orderData.order_no,
      }
    ).then((res) => {
      //console.log('Razorpay response',res)
      result = res;
      result.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    }).catch(err => {
      console.log('razorpay',err)
    })
    
  }else if(payment_method === 'wallet') {
    order.payment_status = 'paid';
    transactions = await Promise.all(cartItems.map(async item => {
      const transaction_amount = (item.item_total * item.quantity) + (item.item_tax * item.quantity);
      const product = await Product.findById(item.product_id);
      return new Transaction({
        user_id: req.session.user._id,
        transaction_id: '#'+fn.generateUniqueId(),
        payment_method: 'wallet',
        transaction_type: 'withdraw',
        transaction_amount,
        current_balance: parseFloat(user.wallet) - parseFloat(transaction_amount),
        description: `Purchase of - ${product.product_name}`,
      })
    })).catch(err => {
      console.log(err)
    })
  }

  //console.log(result)
  if(payment_method === 'razorpay' && (!result || result.error)) {
    return res.send(fn.createToast(false,'error', 'Payment failed'))
  }

  const walletTotal = transactions.reduce((acc, curr) => acc + curr.transaction_amount, 0);
  
  //console.log(user.wallet, walletTotal)

  if(user.wallet < walletTotal) {
    return res.send(fn.createToast(false,'error', 'Insufficient wallet balance'))
  }

  await Promise.all([

    await order.save(),

    await User.findByIdAndUpdate(
      {_id:req.session.user._id},
      {
        $set: {cart: []},
        $inc: {wallet: -walletTotal},
        $push: {coupons: {$each: coupons.map(coupon => coupon.coupon_code)}}
      },
      {new: true }
    ),

    await Transaction.insertMany(transactions),

    cartItems.forEach(async (item) => {
      const max_quantity = Math.max(1,Math.min(Math.floor(item.stock / 3),10));
      await Product.findOneAndUpdate({_id:item.product_id},{
        $set: {max_quantity},
      })
    }),

  ])
  .then(response => {
    req.session.couponsToApply = null
    req.session.couponsToApplyDiscount = null
    //console.log(response)
    return res.send(fn.createToast(true,'success', 'Order placed successfully',null,result ? result : order._id))
  })
  .catch(err => {
    console.log(err)
    res.send(fn.createToast(false, 'error', 'Internal Server Error'))
  })
}

exports.verifyPayment = async (req, res) => {
  const {razorpay_payment_id, razorpay_order_id, razorpay_signature, order_no} = req.body;
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const isValidSignature = validateWebhookSignature(body, razorpay_signature, process.env.RAZORPAY_KEY_SECRET);
  if(isValidSignature) {
    await Order.findOneAndUpdate(
      {order_no},
      {$set: {payment_id: razorpay_payment_id, payment_status: 'paid'}},
    ).then((order) => {
      return res.send(fn.createToast(true,'success', 'Order placed successfully',null,order._id))
    }).catch(err => {
      console.log(err)
      return res.send(fn.createToast(false, 'error', 'Payment verification failed'))
    })
  }

}

exports.viewOrder = async (req, res) => {

  const user_id = req.session.user._id;
  
  const totalOrders = await Order.countDocuments({user_id});
  
  const order_data = await Order.findById(req.query.id)
            .populate('user_id')
            .populate('billing_address')
            .populate('shipping_address')
            .populate('coupons','coupon_code')
            .populate('offers','offer_code')

  //console.log(order_data)
  
  const orderItems = await Promise.all(order_data.cart.map(async (item) => {
    const product = await Product.findById(item.product_id);
    return {
      product_name: product.product_name,
      thumb: product.images[0],
      quantity: item.quantity,
      price: item.price,
      item_tax: item.item_tax,
      item_total: item.item_total,
    };
  }));

  const order = {
      ...order_data.toObject(),
      cart: orderItems,
      totalOrders,
  };

  console.log('view-order',order)

  return res.render('user/view_order', {
    orderItemsCount: order.cart.reduce((acc, curr) => acc + curr.quantity, 0),
    order,
    isLogged: constants.isLogged,
    cartItemsCount: await fn.getCartItemsCount(req.session.user._id),
    wishlist: await fn.getWishlistItems(req.session.user._id),
    isAdmin: false,
  })
}

exports.cancelItem = async (req, res) => {
  const {order_id, item_id} = req.params;
  let oldOrderStatus;
  // finds items cancelled in order and store in to array
  const cart = await Order.findById(order_id).then(order => {
    oldOrderStatus = order.order_status;
    return order.cart
  });
  
  let items = await Promise.all(cart.map(async item => {
    const product = await Product.findOne({_id:item.product_id});
    if(item._id.toString() === item_id){
      item.item_status = 'cancelled';
    }
    
    item.item_tax = product.tax;
    item.product_name = product.product_name;
    
    return item
  }))
  
  const cancelledItems = items.filter(item => item.item_status === 'cancelled');

  const user = await User.findOne({_id:req.session.user._id});
  //console.log('items',cancelledItems)
  // creating transactions for cancelled items
  const transactions = cancelledItems.map(item => {
    const transaction_amount = (item.item_total * item.quantity) + (item.item_tax * item.quantity);
    return new Transaction({
      user_id: req.session.user._id,
      transaction_id: '#'+fn.generateUniqueId(),
      payment_method: 'wallet',
      transaction_type: 'deposit',
      transaction_amount,
      current_balance: parseFloat(user.wallet) + parseFloat(transaction_amount),
      description: `Refund on cancellation - ${item.product_name}`,
    })
  })

  //console.log('cancelledItems', transactions)

  let orderStatus = function(){
    if(items.length === cancelledItems.length || items.every(item => item.item_status === 'cancelled')){
      return 'cancelled'
    }
    return oldOrderStatus;
  };

  await Promise.all([
    await User.findByIdAndUpdate(
      { _id: req.session.user._id },
      { 
        $inc: { wallet: +parseFloat(transactions.reduce((acc, curr) => acc + curr.transaction_amount, 0)) }
      },
      {new: true }
    ),
    await Promise.all(cancelledItems.map(async (item) => {
      await Product.findOneAndUpdate({_id:item.product_id},{
        $inc: {stock: item.quantity},
      })
    })),
    await Transaction.insertMany(transactions),
    
    await Order.updateOne(
      { _id: order_id }, 
      { 
        $set: {
          cart: items,
          order_status: orderStatus(),
        },
      },
      {new: true } 
    ),
  ]).then((result) => {
    //console.log('Item cancelled successfully',result)
    return res.send(fn.createToast(true,'success', 'Item cancelled successfully'))
  }).catch(err => {
    console.log(err)
  })

}

exports.downloadInvoice = async (req,res) => {

  const totalOrders = await Order.countDocuments({user_id:req.session.user._id});
  const order_data = await Order.findById(req.query.order)
            .populate('user_id')
            .populate('billing_address')
            .populate('shipping_address')
            .populate('coupons','coupon_code')
            .populate('offers','offer_code')

  //console.log(order_data)
  
  const orderItems = await Promise.all(order_data.cart.map(async (item) => {
    const product = await Product.findById(item.product_id);
    return {
      product_name: product.product_name,
      thumb: product.images[0],
      quantity: item.quantity,
      price: item.price,
      item_tax: item.item_tax,
      item_total: item.item_total,
    };
  }));

  const order = {
      ...order_data.toObject(),
      cart: orderItems,
      totalOrders,
  };
  //console.log(order)
  const pdfData = await createInvoice(order);
  res.setHeader('Content-Disposition', 'inline; filename=sales_report.pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.end(pdfData);
}
