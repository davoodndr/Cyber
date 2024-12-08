
const checkAccess = (req,res,next) => {
  const user = req.session.user;
  if(user && !user.isBlocked){
    next()
  }else{
    res.redirect('/login')
  }
}

const isLogin = (req,res,next) => {
  const user = req.session.user;
  if(user && !user.isBlocked){
    res.redirect('/')
  }else{
    next()
  }
}


module.exports = {
  checkAccess,
  isLogin
}