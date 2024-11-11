const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  var_name: { 
    type: String,
    required: true
  }, // e.g., size, color
  var_option: { 
    type: String,
    required: true
  }, // e.g., ["Small", "Medium", "Large"]
  var_price: Number,
  var_count: Number
});


const productSchema = new mongoose.Schema({
  product_name: {
    type: String,
    unique:true
  },
  product_slug: {
    type: String,
    required: true,
    unique: true
  },
  product_status: String,
  description: String,
  pricing: {
    original_price: Number,
    selling_price: Number
  },
  stock: Number,
  brand: String,
  category:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'category'
  },
  specifications:[{
    spec_name: String,
    spec_value: String,
  }],
  variants:[variantSchema],
  /* highlights:{
    highlight_name: String,
    highlight_value: String
  },*/
  tax: {
    type: Number,
    default: function() {
      return this.pricing.selling_price * 0.05;
    }
  },
  images:[String],
  is_deleted:{
    type: Boolean,
    default: false
  },
  popularity: {
    type: Number,
    default: 0,
  },
  max_quantity: {
    type: Number,
    default: 0
  },
},{timestamps:true})

productSchema.pre('save', function(next) {
  if (this.isModified('stock')) {
    this.max_quantity = Math.max(1,Math.min(Math.floor(item.stock / 3),10));
  }
  next();
});

module.exports = mongoose.model('product',productSchema)