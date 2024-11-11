const Product = require('../models/productModel');
const Category = require('../models/categoryModel')
const path = require('path');
const fs = require('fs');
const fn = require('../helpers/functions');
const constants = require('../constants/constants')

const getProducts = async (req, res) => {
  const {from} = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const products = await Product.find().populate('category')
                    .skip(skip).limit(limit).sort({'createdAt':-1})
  products.forEach(async el => {
    let images = []
    el.images.forEach(img => {
      if(!img.match('/products')){
        let nam = img.split('-').pop()
        let imgNew = `http://localhost:8080/admin/images/uploads/products/${el.product_slug}/${nam}`
        images.push(imgNew)
      }
    })
    if(images.length){
      await Product.findByIdAndUpdate({_id:el._id},{
        $set:{images:images}
      })
    }
  })
  
  const count = await Product.countDocuments();
  const totalPages = Math.ceil(count / limit);

  if(from) {
    req.session.product_info = null;
    req.session.product_values = null
  }

  res.render('admin/products',{
    products, 
    product_info: req.session.product_info,
    pageName: 'products',
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    isAdmin: true
  });
}

const addProduct = async (req, res) => {

  //console.log('add',req.session.product_info,req.session.product_values)

  return res.render('admin/addProduct',{
    pageName: 'products',
    categories: await Category.find(),
    product_info: req.session.product_info,
    product_values: req.session.product_values,
    isAdmin:true
  })
}

const saveDraft = async (req, res) => {
  let {status} = req.body
  console.log(req.body);
}

const publishProduct = async (req, res) => {

  /* Validation => */
    
  let pInfo = {}, pValue = {};
  //console.log(req.body)
  /* typeof obj[1] === 'object' && !Array.isArray(obj[1]) ? !Object.entries(obj[1]).filter(([, value]) => value.length).length : !obj[1].length */
  Object.entries(req.body)
  .filter(obj => { //!obj[1].filter(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val).length)
    if(Array.isArray(obj[1]) && obj[1].find(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => !val.length))){
      
      return obj[1].find(el => !Array.isArray(el))
    }else{
      
      return !obj[1].length || (obj[0] === 'images' && obj[1].length < 3)
    }
  })
  .map(obj => {
    let key;
    //console.log('test1',obj[0])
    if(typeof obj[1] === 'object' && obj[1].find(el => !Array.isArray(el))){
      const elm = Object.entries(obj[1].find(el => !Array.isArray(el))).filter(([,val]) => !val.length);
      
      elm.forEach(k => {
        //console.log('test1',k)
        key = k[0].replace('_'," ");
        pInfo[k[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      })

    }else{
      if((obj[0] === 'images' && obj[1].length < 3)){
        key = obj[0].replace('_'," ");
        pInfo[obj[0]] = 'Atleat 3 images required.'
      }else{
        key = obj[0].replace('_'," ");
        pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      }
      
    }
    return pInfo
  });

  Object.entries(req.body) 
    .filter(obj =>{
      if(Array.isArray(obj[1])){
        if(obj[1].find(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val).length > 0))
          return obj[1].filter(el => !Array.isArray(el))
      }else{
        return obj[1].length 
      }
    })
    .map(obj => {
      
      // to evaluate single spec feild
      /* 
        if(typeof obj[1] === 'object' && obj[1].find(el => !Array.isArray(el))){
          const elm = Object.entries(obj[1].find(el => !Array.isArray(el))).filter(([,val]) => val.length);
          console.log('test1',elm[0])
          elm.forEach(el => {
            pValue[el[0]] = el[1]
          })
          
        }else{ 
          
        //}
      */

      pValue[obj[0]] = obj[1]

      return pValue
  });

  if(Object.keys(pValue).length){
    req.session.product_values = pValue;
  }
  //console.log(req.body)
  //return validation messages on blank
  if(Object.keys(pInfo).length){
    req.session.product_info = pInfo
    //return res.redirect('/admin/add-product')
    return res.send(fn.sendResponse(400,'Blank Data!','error','Fields can\'t blank!'))
  }

  /* Validatoin <= */
  
  /* Publishing => */

  let {product_name, product_slug, product_status,description,original_price,selling_price,stock,brand,category,specifications,variants,images} = req.body
  
  /* 
    Specification cannot 
  */
  const newProduct = new Product({
    product_name,
    product_slug,
    product_status,
    description,
    pricing:{
      original_price,
      selling_price
    },
    stock,
    brand,
    category,
    specifications,
    variants,
    images
  })

  await newProduct.save().then(()=>{
    return res.send(fn.sendResponse(201,'Success!','success','Product created successfully'))
  }).catch((error) =>{
    if (error.code === 11000) {
      return res.send(fn.sendResponse(400,'Duplicate!','error','This product already exists!'))
    }
    // Handle other errors
    console.log(error)
    return res.send(fn.sendResponse(500,'Error!','error','Unknown Server error.'))
  })
  
}

const editProduct = async (req, res) => {
  const {slug} = req.params
  
  return res.render('admin/editProduct',{
    pageName: 'products',
    product: await Product.findOne({product_slug:slug}),
    categories: await Category.find(),
    product_info: req.session.product_info,
    product_values: req.session.product_values,
    isAdmin:true
  })
}

const deleteProduct = async (req, res) => {
  const {slug} = req.params

  await Product.findOneAndUpdate({product_slug:slug},{
    $set:{is_deleted:true,product_status: 'disabled'}
  }).then(() => {
    req.session.product_info = fn.sendResponse(200,'Success!','success','Product deleted successfully')
  }).catch(err => {
    console.log(err);
  })

  return res.redirect('/admin/products')
}

const deleteProductImage = async (req,res) => {
  
  const {slug} = req.params
  const {src} = req.query
  const dirPath = path.join(constants.UPLOAD_PATH, `products/${slug}`)
  const filePath = path.join(constants.UPLOAD_PATH, `products/${slug}`, src.split('/').pop());
  const product = await Product.findOne({product_slug:slug})
  if(product.images.length < 3 ) return res.send(fn.sendResponse(400,'Error!','error','Please keep 3 images for product.'))
  product.images = product.images.filter(image => image != src)

  fs.unlink(filePath,(async err =>{
    if(err){
      console.log(err) 
      res.send(fn.sendResponse(500,'Error!','error','Unknown Server error.'))
    }else{

      //delete from db
      await product.save()

      //delete folder if empty
      const files = fs.readdirSync(dirPath);
      if(files.length === 0){
        fs.rmdirSync(dirPath)
      }
      return res.send({status:200})
    }
  }))

}

const restoreProduct = async (req, res) => {
  const {slug} = req.params

  await Product.findOneAndUpdate({product_slug:slug},{
    $set:{is_deleted:false,product_status: 'draft'}
  }).then(() => {
    req.session.product_info = fn.sendResponse(200,'Success!','success','Product restored successfully')
  }).catch(err => {
    console.log(err);
  })
  
  return res.redirect('/admin/products')
}

const updateProduct = async (req, res) => {
  
  /* Validation => */
  const {slug} = req.params;
  const {from, len} = req.query;
  //console.log('update',req.query)
  
  let pInfo = {}, pValue = {};
  /* typeof obj[1] === 'object' && !Array.isArray(obj[1]) ? !Object.entries(obj[1]).filter(([, value]) => value.length).length : !obj[1].length */
  Object.entries(req.body)
  .filter(obj => {
    
    if(Array.isArray(obj[1]) && !obj[1].find(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val).length)){
      if(obj[0] != 'images' || !(from == 'edit' && len > 2)){
        return obj[1].find(el => !Array.isArray(el))
      }
    }else{
      //console.log('test0',obj[1])
      return !obj[1].length || (obj[0] === 'images' && obj[1].length < 3)
    }
  })
  .map(obj => {
    //console.log('test1',obj[1])
    let key;
    if(typeof obj[1] === 'object' && obj[1].find(el => !Array.isArray(el))){
      const elm = Object.entries(obj[1].find(el => !Array.isArray(el))).filter(([,val]) => !val.length);
      
      elm.forEach(k => {
        //console.log('test1',k)
        key = k[0].replace('_'," ");
        pInfo[k[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      })
    /* if(typeof obj[1] === 'object' && !Array.isArray(obj[1])){
      Object.entries(obj[1]).forEach(k => {
        key = k[0].replace('_'," ");
        pInfo[k[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
      }) */
      if((obj[0] === 'images' && obj[1].length < 3)){
        key = obj[0].replace('_'," ");
        pInfo[obj[0]] = 'Atleat 3 images required.'
      }
    }else{
      
      key = key = obj[0].replace('_'," ");
      pInfo[obj[0]] = `${key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()} cannot blank`
    }
    return pInfo
  });

  Object.entries(req.body) 
    .filter(obj =>{
      if(Array.isArray(obj[1])){
        if(obj[1].find(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val).length > 0))
          return obj[1].filter(el => !Array.isArray(el) && Object.entries(el).filter(([,val]) => val.length > 0))
      }else{
        return obj[1].length 
      }
    } /* typeof obj[1] === 'object' && !Array.isArray(obj[1]) ? Object.entries(obj[1]).filter(([, value]) => value.length).length : obj[1].length */)
    .map(obj => {
      pValue[obj[0]] = obj[1]
      return pValue
  });

  if(Object.keys(pValue).length){
    req.session.product_values = pValue;
  }

  console.log('test1',pInfo)
  //return validation messages on blank
  if(Object.keys(pInfo).length){
    req.session.product_info = pInfo
    //return res.redirect(`/admin/products/${slug}/edit`)
    return res.send(fn.sendResponse(400,'Error!','error','Blank fields detected.'))
  }

  /* Validatoin <= */
  
  /* Publishing => */

  let {product_name, product_slug, product_status,description,original_price,selling_price,stock,brand,category,specifications,variants,images} = req.body
  
  await Product.findOneAndUpdate({product_slug:slug},{
    $set: {
      product_name,
      product_slug,
      product_status,
      description,
      pricing:{
        original_price,
        selling_price
      },
      stock,
      brand,
      category,
      specifications,
      variants,
    },
    $addToSet: {images:images}

  }).then(() => {
    return res.send(fn.sendResponse(201,'Success!','success','Product updated successfully'))
  }).catch((error) =>{
    // Handle other errors
    console.log(error)
    return res.send(fn.sendResponse(500,'Error!','error','Unknown Server error.'))
  })
}

const clearSession = (req, res) => {
  const {status} = req.params;
  if(status == 201){
    req.session.product_info= null;
    req.session.product_values= null;
    return res.send({status:200})
  }else if(status == 200){
    req.session.product_info= null;
    return res.send({status:200})
  }else{
    return res.send({status:status})
  }
  /*
  return res.status(200).send({msg:'reset'}) */
}

module.exports = {
  getProducts,
  addProduct,
  saveDraft,
  publishProduct,
  editProduct,
  deleteProduct,
  deleteProductImage,
  restoreProduct,
  updateProduct,
  clearSession
}