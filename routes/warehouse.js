const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

// Dashboard - Alerts
router.get("/", async (req, res) => {
	// Fetch all products (for MVP this is fine, for scale use RPC or View)
	const { data: allProducts, error } = await supabase
		.from("products")
		.select("*")
		.order("stock");

	if (error) console.error(error);

	// Filter logic: stock <= min_stock
	const alerts = allProducts
		? allProducts.filter((p) => p.stock <= p.min_stock)
		: [];

	res.render("warehouse/dashboard", {
		title: "Almacén",
		alerts: alerts,
	});
});

// Inventory List
router.get("/inventory", async (req, res) => {
	const { data: products } = await supabase
		.from("products")
		.select("*")
		.order("name");

	res.render("warehouse/inventory", {
		title: "Inventario",
		products: products || [],
	});
});

// Restock
router.post("/restock", async (req, res) => {
	const { id, quantity } = req.body;
	const qty = parseInt(quantity);

	if (qty <= 0) return res.redirect("/warehouse/inventory");

	try {
		const { data: product } = await supabase
			.from("products")
			.select("stock")
			.eq("id", id)
			.single();
		const newStock = product.stock + qty;

		await supabase.from("products").update({ stock: newStock }).eq("id", id);

		// Log movement (Optional, if we implemented stock_logs)
		/* await supabase.from('stock_logs').insert([{
            product_id: id,
            change_amount: qty,
            change_type: 'restock',
            user_id: req.session.user.id
        }]); */
	} catch (err) {
		console.error(err);
	}

	res.redirect("/warehouse/inventory");
});

// Add Product (Same as Admin but exposed to Warehouse)
router.post("/products", async (req, res) => {
	const { name, sku, price, stock, category, min_stock } = req.body;
	const { error } = await supabase
		.from("products")
		.insert([{ name, sku, price, stock, category, min_stock }]);

	if (error) console.error(error);
	res.redirect("/warehouse/inventory");
});

// Labels View
router.get("/labels", async (req, res) => {
	const { data: products } = await supabase
		.from("products")
		.select("*")
		.order("name");
	res.render("warehouse/labels", {
		title: "Imprimir Etiquetas",
		products: products || [],
	});
});

module.exports = router;
