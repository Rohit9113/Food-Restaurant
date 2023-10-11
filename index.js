const express = require('express');
const ejs = require('ejs');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const session = require('express-session');
const paypal = require('paypal-rest-sdk'); // Added for PayPal integration

const app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'secret' }));

//Middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    // User is logged in, proceed to the next middleware/route
    next();
  } else {
    // User is not logged in, redirect to the login page with a message
    req.session.message = 'Please log in before placing an order.';
    res.redirect('/login'); // Replace with your actual login route
  }
}

// Check Product in Cart
function isProductInCart(cart, id) {
  for (let i = 0; i < cart.length; i++) {
    if (cart[i].id == id) {
      return true;
    }
  }
  return false;
}

function calculateTotal(cart, req) {
  let total = 0;
  for (let i = 0; i < cart.length; i++) {
    if (cart[i].sale_price) {
      total += cart[i].sale_price * cart[i].quantity;
    } else {
      total += cart[i].price * cart[i].quantity;
    }
  }
  req.session.total = total;
  return total;
}

// Configure MySQL connection
const con = mysql.createConnection({
  host: 'localhost',
  port: 3307,
  user: 'root',
  password: '',
  database: 'food_industry_db',
});

// Connect to MySQL
con.connect(function (err) {
  if (err) {
    console.error('Error connecting to database:', err);
    throw err;
  }
  console.log('DB Connected!');
});


app.get('/', function (req, res) {
  // Query your database to fetch data
  const query = 'SELECT * FROM products';
  con.query(query, function (err, result) {
    if (err) {
      console.error('Error querying database:', err);
      throw err;
    }

    const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/index', {
      userIsLoggedIn: userIsLoggedIn,
      result: result,
      user:req.session.user
    })
  });
});


// Add Cart Code
app.post('/add_cart', function (req, res) {
  const id = req.body.id;
  const name = req.body.name;
  const price = req.body.price;
  const sale_price = req.body.sale_price;
  const quantity = req.body.quantity;
  const image = req.body.image;

  const product = { id: id, name: name, price: price, sale_price: sale_price, quantity: quantity, image: image };

  if (req.session.cart) {
    const cart = req.session.cart;

    if (!isProductInCart(cart, id)) {
      cart.push(product);
    }
  } else {
    req.session.cart = [product];
  }

  calculateTotal(req.session.cart, req);

  // Return cart HTML page
  res.redirect('/cart');
});

app.get('/cart', function (req, res) {
  const cart = req.session.cart || [];
  const total = req.session.total || 0;

  const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/cart', {
      userIsLoggedIn: userIsLoggedIn,
      total: total,
      cart: cart,
      user:req.session.user
    })
});

// Remove Product from Cart
app.post('/remove_product', function (req, res) {
  const id = req.body.id;

  if (req.session.cart) {
    const cart = req.session.cart;

    // Find the index of the product to remove
    const index = cart.findIndex((item) => item.id == id);

    // If the product is found in the cart, remove it
    if (index !== -1) {
      cart.splice(index, 1);
    }
  }

  // Recalculate the total
  calculateTotal(req.session.cart, req);

  // Redirect back to the cart page
  res.redirect('/cart');
});

app.post('/edit_produts_quantity', function (req, res) {
  const id = req.body.id;
  const quantity = req.body.quantity;
  const increase_btn = req.body.increase_product_quantity;
  const decrease_btn = req.body.decrease_product_quantity;

  const cart = req.session.cart;

  if (increase_btn) {
    for (let i = 0; i < cart.length; i++) {
      if (cart[i].id == id) {
        if (cart[i].quantity > 0) {
          cart[i].quantity = parseInt(cart[i].quantity) + 1;
        }
      }
    }
  }

  if (decrease_btn) {
    for (let i = 0; i < cart.length; i++) {
      if (cart[i].id == id) {
        if (cart[i].quantity > 1) {
          cart[i].quantity = parseInt(cart[i].quantity) - 1;
        }
      }
    }
  }

  calculateTotal(cart, req);
  res.redirect('/cart');
});

app.get('/checkout', function (req, res) {
  const total = req.session.total;
  // res.render('pages/checkout', { total: total });
  const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/checkout', {
      userIsLoggedIn: userIsLoggedIn,
      total: total,
      user:req.session.user
    })
});

app.post('/place_order', isAuthenticated, function (req, res) {
  // The user is authenticated, proceed with the order processing logic here
  var cost = req.session.total;
  var name = req.body.name;
  var email = req.body.email;
  var phone = req.body.phone;
  var city = req.body.city;
  var address = req.body.address;
  var status = 'Not paid';
  var date = new Date();
  var products_ids = "";
  var id = Date.now();

  req.session.order_id = id;


  var db = mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: '',
    database: 'food_industry_db',
  });

  var cart = req.session.cart
  for (let i = 0; i < cart.length; i++) {
    products_ids = products_ids + "," + cart[i].id;
  }


  db.connect((err) => {
    if (err) {
      console.log(err);
    } else {
      var query = "INSERT INTO orders(id, cost, name, email, status, city, address, phone, date, products_ids) VALUES ?";
      var values = [
        [id, cost, name, email, status, city, address, phone, date, products_ids]
      ];
      db.query(query, [values], (err, result) => {
        for (let i = 0; i < cart.length; i++) {
          var query = "INSERT INTO order_item(order_id, product_id, product_name, product_price, product_image, product_quantity, order_date) VALUES ?";
          var values = [
            [id, cart[i].id, cart[i].name, cart[i].price, cart[i].image, cart[i].quantity, new Date()]
          ];
          db.query(query, [values], (err, result) => { });
        }
        res.redirect('/payment');
      })
    }
  })
});

app.get('/payment', (req, res) => {
  var total = req.session.total;

  // res.render('pages/payment', { total: total });
  const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/payment', {
      userIsLoggedIn: userIsLoggedIn,
      total: total,
      user:req.session.user
    })
});

app.get('/varify_payment', function (req, res) {
  var transaction_id = req.query.transaction_id;
  var order_id = req.session.order_id;

  var db = mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: '',
    database: 'food_industry_db',
  });

  db.connect((err) => {
    if (err) {
      console.log(err);
    } else {
      var query = "INSERT INTO orders(order_id, transaction_id, date) VALUES ?";
      var values = [
        [order_id, transaction_id, new Date()]
      ];

      db.query(query, [values], (err, result) => {
        db.query("UPDATE orders SET status='paid' WHERE id = '" + order_id + "'", (err, result) => { });
        res.redirect('/thank_you');
      });
    }
  });
});

app.get('/thank_you', function (req, res) {
  var order_id = req.session.order_id;

  // res.render('pages/thank_you', { order_id: order_id });
  const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/products', {
      userIsLoggedIn: userIsLoggedIn,
      order_id:order_id,
      user:req.session.user
    })
});

app.get('/single_product', function (req, res) {
  var id = req.query.id;

  const con = mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: '',
    database: 'food_industry_db',
  });

  con.query("SELECT * FROM products WHERE id='" + id + "'", (err, result) => {
    // res.render('pages/single_product', { result: result });
    const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/single_product', {
      userIsLoggedIn: userIsLoggedIn,
      result: result,
      user:req.session.user
    })
  })

});

app.get('/products', function (req, res) {
  const con = mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: '',
    database: 'food_industry_db',
  });

  con.query("SELECT * FROM products", (err, result) => {
    const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/products', {
      userIsLoggedIn: userIsLoggedIn,
      result: result,
      user:req.session.user
    })
    
  })

});

app.get('/about', function (req, res) {
  // res.render('pages/about');
  const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/about', {
      userIsLoggedIn: userIsLoggedIn,
      user:req.session.user
    })
  
});


app.get('/search', function (req, res) {
  const query = req.query.query;

  const searchQuery = 'SELECT * FROM products WHERE name LIKE ?';
  con.query(searchQuery, [`%${query}%`], function (err, result) {
    if (err) {
      console.error('Error querying database:', err);
      throw err;
    }
    res.render('pages/search_results', { result: result, query: query });
    const userIsLoggedIn = req.session.user !== undefined;

    res.render('pages/search_results', {
      userIsLoggedIn: userIsLoggedIn,
      result: result,
      query:query,
      user:req.session.user
    })
  });
});

// Render the login page initially
app.get('/login', function (req, res) {
  res.render('pages/login');
});

// Handle the POST request when the login form is submitted
app.post('/login', function (req, res) {
  const username = req.body.username;
  const password = req.body.password;

  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  con.query(query, [username, password], function (err, result) {
    if (err || result.length === 0) {
      req.session.message = 'Invalid username or password.';
      res.redirect('/login'); // Redirect to login page with an error message
    } else {
      // Authentication successful
      req.session.user = result[0]; // Store user data in the session
      res.redirect('/'); // Redirect to the home page after successful login
    }
  });
});

// Implement the logout route
app.get('/logout', function (req, res) {
  // Destroy the session to log the user out
  req.session.destroy(function (err) {
    if (err) {
      console.error('Error destroying session:', err);
    } else {
      res.redirect('/login');
    }
  });
});


// Signup route
app.get('/signup', function (req, res) {
  res.render('pages/signup');
});

// Handle the POST request when the signup form is submitted
app.post('/signup', function (req, res) {
  const username = req.body.username;
  const password = req.body.password;
  const confirmPassword = req.body.confirm_password;
  const name = req.body.name;
  const phone = req.body.phone;
  const state = req.body.state;
  const city = req.body.city;
  const pin = req.body.pin;
  const address = req.body.address;
  const DOB=req.body.DOB;

  // Check if the password and confirmPassword match
  if (password !== confirmPassword) {
    req.session.message = 'Passwords do not match.';
  } else {
    // Insert the user data into the "users" table
    const query = 'INSERT INTO users (username, password, name, phone, state, city, pin, address, DOB) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    con.query(query, [username, password, name, phone, state, city, pin, address, DOB], function (err, result) {
      if (err) {
        console.error('Error inserting user data:', err);
        req.session.message = 'An error occurred while signing up. Please try again later.';
        res.redirect('/signup'); // Redirect to signup page with an error message
      } else {
        // Redirect to the login page after successful signup
        res.redirect('/login');
      }
    });
  }
});



// Start the server
app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});