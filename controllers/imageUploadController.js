const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const constants = require('../constants/constants')

const memoryStorage = multer.memoryStorage();

/* const diskStorage = multer.diskStorage({
  destination: function(req, file, cb){
    return cb(null, uploadDir)
  },
  filename: function (req, file, cb){
    return cb(null,`${Date.now()}-${file.originalname}.jpg`)
  }
}) */


const multerFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    cb(null, true);
  } else {
    return cb(new Error('Please upload only images !'),false);
  }
};

const upload = multer({
  storage: memoryStorage,
  /* fileFilter: multerFilter, */
});

const uploadFiles = upload.array('images', 10);

exports.uploadImages = (req, res, next) => {
  uploadFiles(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).send({title: 'Error', icon: 'error', msg: 'Only 100files can upload !'});
      }
    } else if (err) {
      return res.send(err);
    }
    
    next();
  });
};

const writeImage = async function(file, newFilename){
  await sharp(file.buffer)
        .resize(600, 600)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(`${newFilename}`);
}

exports.resizeImages = async (req, res, next) => {
  //console.log('resize_images',req.query)
  const slug = req.params.slug ?? req.body.product_slug
  const {section} = req.query
  if (!req.files) return next();

  req.body.images = []; // position strict
  if(slug && slug.length){
    //create folder for product
    const dir = path.join(constants.UPLOAD_PATH, `${section}/${slug}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir,{recursive: true});
    }

    await Promise.all(
      req.files.map(async (file) => {
        
        const filename = file.originalname.split('-').pop().replace(/\..+$/, '');
        const newFilename = `${filename}.jpg`
        writeImage(file, `${dir}/${newFilename}`)
        const protocol = req.protocol;
        const host = req.get('host');
        const link = `/admin/images/uploads/${section}/${slug}/${newFilename}`
        req.body.images.push(link);
        
        //const newFilename = isExists ? filename+'.jpg' : `${Date.now()}-${filename}.jpg`;
        /* let newFilename = ''
        if(!fs.existsSync(constants.UPLOAD_PATH,file.originalname)){
          newFilename = filename+'.jpg'
          console.log(newFilename,isExists)
          writeImage(file,newFilename);
        }else{
          newFilename = `${Date.now()}-${filename}.jpg`
          writeImage(file, newFilename)
          const protocol = req.protocol;
          const host = req.get('host');
          req.body.images.push(`${protocol}://${host}/admin/images/uploads/${newFilename}`);
        }*/

      })
    );

  }
  
  next();
};

exports.getResultImages = async (req, res) => {
  if (req.body.images.length <= 0) {
    return res.send(`You must select at least 1 image !`);
  }

  const images = req.body.images.map((image) => '' + image + '').join(', ');

  return res.send(`Images were uploaded: ${images}`);
};