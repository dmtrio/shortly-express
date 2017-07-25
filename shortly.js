var session = require('express-session');
var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var GitHubStrategy = require('passport-github2').Strategy;
var github = require('./githubConfig');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var GITHUB_CLIENT_ID = github.GITHUB_CLIENT_ID;
var GITHUB_CLIENT_SECRET = github.GITHUB_CLIENT_SECRET;

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: 'http://127.0.0.1:4568/auth/github/callback'
},
  function(accessToken, refreshToken, profile, done) {

    process.nextTick(function () {

      return done(null, profile);
    });
  }
));


var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

isLoggedIn = function (req, res, next) {
  if (!req.session.loggedIn) {
    res.status(302).redirect('/login');
  } else {
    next();
  }
};

var ensureAuthenticated = function (req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
};

app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }),
  function(req, res) {
  });

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
// here we would store the profile/email with our user data
// need a new schema for that
    res.redirect('/');
  });

app.get('/', ensureAuthenticated, function(req, res) {
  // res.send('Hello, ' + req.user.displayName + '!');
  res.render('index');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/create', ensureAuthenticated, function(req, res) {
  res.render('index');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/links', ensureAuthenticated, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/logout', function(req, res) {
  req.session.loggedIn = false;
  res.redirect('/login');
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/login');
});

app.post('/links', ensureAuthenticated, function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

// app.post('/login', function(req, res) {
//   var username = req.body.username;
//   var password = req.body.password;

//   new User({ username: username}).fetch().then(function(found) {
//     if (found) {
//       bcrypt.compare(password, found.attributes.password, function(error, result) {
//         if (result) {
//           req.session.loggedIn = true;
//           res.status(302).redirect('/');
//         } else {
//           res.status(403).redirect('/signup');
//           //should handle this by warning the password was incorrect
//         }
//       });
//     } else {
//       res.status(403).redirect('/login');
//     }
//   });
// });

// app.post('/signup', function(req, res) {
//   var username = req.body.username;
//   var password = req.body.password;

//   new User({ username: username}).fetch().then(function(found) {
//     if (found) {
//       res.status(302).redirect('/login');
//     } else {
//       var hash = bcrypt.hashSync(password);
//       Users.create({
//         // YES WE ARE GOOD DEVELOPERS IT IS NOT ALL PLAINTEXT!!!!!!!
//         username: username,
//         password: hash
//       })
//       .then(function() {
//         req.session.loggedIn = true;
//         res.status(302).redirect('/');
//       });
//     }
//   });
// });

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
