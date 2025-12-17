const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const bcrypt = require("bcryptjs");

// Dashboard - Overview
router.get("/", async (req, res) => {
	try {
		// Fetch stats
		const { count: productCount } = await supabase
			.from("products")
			.select("*", { count: "exact", head: true });
		const { count: userCount } = await supabase
			.from("users")
			.select("*", { count: "exact", head: true });

		// Calculate Sales Today
		const today = new Date().toISOString().split("T")[0];
		const { data: salesTodayData, error: salesError } = await supabase
			.from("sales")
			.select("total_base, total_surcharge, total") // Include 'total' for backward compatibility if 'total_base' isn't always present
			.gte("created_at", today + "T00:00:00")
			.lt("created_at", today + "T23:59:59.999"); // Use .999 to ensure full day

		let salesTodayTotal = 0;
		if (salesTodayData) {
			salesTodayTotal = salesTodayData.reduce((sum, sale) => {
				const base = parseFloat(sale.total_base) || parseFloat(sale.total) || 0;
				const surcharge = parseFloat(sale.total_surcharge) || 0;
				return sum + base + surcharge;
			}, 0);
		}

		// Ensure sales table exists or handle error if empty
		const { data: recentSales, error: recentSalesError } = await supabase
			.from("sales")
			.select("*, users(username)")
			.order("created_at", { ascending: false })
			.limit(5);

		res.render("admin/dashboard", {
			title: "Panel de Administración",
			stats: {
				products: productCount || 0,
				users: userCount || 0,
				salesToday: salesTodayTotal.toFixed(2), // Display sales today
			},
			recentSales: recentSales || [],
		});
	} catch (err) {
		console.error(err);
		res.render("error", { message: "Error cargando dashboard" });
	}
});

// Payment Methods
router.get("/payments", async (req, res) => {
	const { data: methods, error } = await supabase
		.from("payment_methods")
		.select("*")
		.order("created_at");

	res.render("admin/payments", {
		title: "Métodos de Pago",
		methods: methods || [],
	});
});

router.post("/payments", async (req, res) => {
	const { name, surcharge_percent } = req.body;
	const { error } = await supabase
		.from("payment_methods")
		.insert([{ name, surcharge_percent }]);

	if (error) console.error(error);
	res.redirect("/admin/payments");
});

router.post("/payments/toggle/:id", async (req, res) => {
	// Get current status
	const { data: method } = await supabase
		.from("payment_methods")
		.select("active")
		.eq("id", req.params.id)
		.single();

	const { error } = await supabase
		.from("payment_methods")
		.update({ active: !method.active })
		.eq("id", req.params.id);

	if (error) console.error(error);
	res.redirect("/admin/payments");
});

// Sales History
router.get("/sales", async (req, res) => {
	const { data: sales, error } = await supabase
		.from("sales")
		.select("*, users(username), sale_items(id)")
		.order("created_at", { ascending: false })
		.limit(50);

	res.render("admin/sales", {
		title: "Historial de Ventas",
		sales: sales || [],
	});
});

// Analytics
router.get("/analytics", async (req, res) => {
	try {
		const now = new Date();
		const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

		// Fetch all sales for the current year with items
		const { data: salesYear, error } = await supabase
			.from("sales")
			.select("*, sale_items(quantity, product_id, products(name))")
			.gte("created_at", startOfYear)
			.order("created_at", { ascending: false });

		if (error) console.error(error);

		// Date Helpers
		const isSameDay = (d1, d2) => d1.toDateString() === d2.toDateString();
		const isSameWeek = (d1, d2) => {
			const onejan = new Date(d1.getFullYear(), 0, 1);
			const week1 = Math.ceil(
				((d1 - onejan) / 86400000 + onejan.getDay() + 1) / 7
			);
			const week2 = Math.ceil(
				((d2 - onejan) / 86400000 + onejan.getDay() + 1) / 7
			);
			return week1 === week2 && d1.getFullYear() === d2.getFullYear();
		};
		const isSameMonth = (d1, d2) =>
			d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

		// Metrics Container
		const metrics = {
			today: { revenue: 0, orders: 0, items: 0 },
			week: { revenue: 0, orders: 0, items: 0 },
			month: { revenue: 0, orders: 0, items: 0 },
			year: { revenue: 0, orders: 0, items: 0 },
		};

		const topProductsMap = {}; // Aggregate all time (or year)

		if (salesYear) {
			salesYear.forEach((sale) => {
				const date = new Date(sale.created_at);
				const total =
					parseFloat(sale.total_base || 0) +
						parseFloat(sale.total_surcharge || 0) ||
					parseFloat(sale.total || 0); // Fallback logic
				const itemCount = sale.sale_items.reduce(
					(sum, item) => sum + item.quantity,
					0
				);

				// Update Metrics
				const updateMetric = (key) => {
					metrics[key].revenue += total;
					metrics[key].orders += 1;
					metrics[key].items += itemCount;
				};

				updateMetric("year");
				if (isSameMonth(date, now)) updateMetric("month");
				if (isSameWeek(date, now)) updateMetric("week");
				if (isSameDay(date, now)) updateMetric("today");

				// Process Top Products (for year)
				sale.sale_items.forEach((i) => {
					const pid = i.product_id;
					const name = i.products ? i.products.name : "Unknown";
					if (!topProductsMap[pid])
						topProductsMap[pid] = { name, sold: 0, revenue: 0 };
					topProductsMap[pid].sold += i.quantity;
					topProductsMap[pid].revenue += i.quantity * (i.price_at_sale || 0); // Approx revenue per item
				});
			});
		}

		// Process Top Products Lists
		const getTop = (map) =>
			Object.values(map)
				.sort((a, b) => b.sold - a.sold)
				.slice(0, 10);

		// For "Top Today", we filter simply
		const topTodayMap = {};
		if (salesYear) {
			salesYear
				.filter((s) => isSameDay(new Date(s.created_at), now))
				.forEach((s) => {
					s.sale_items.forEach((i) => {
						const pid = i.product_id;
						const name = i.products ? i.products.name : "Unknown";
						if (!topTodayMap[pid]) topTodayMap[pid] = { name, sold: 0 };
						topTodayMap[pid].sold += i.quantity;
					});
				});
		}

		res.render("admin/analytics", {
			title: "Analítica Avanzada",
			metrics,
			topToday: getTop(topTodayMap),
			topYear: getTop(topProductsMap),
		});
	} catch (err) {
		console.error(err);
		res.render("error", {
			message: "Error cargando analíticas: " + err.message,
		});
	}
});

// Products Management
router.get("/products", async (req, res) => {
	const { data: products, error } = await supabase
		.from("products")
		.select("*")
		.order("name");

	res.render("admin/products", {
		title: "Gestión de Productos",
		products: products || [],
	});
});

router.post("/products", async (req, res) => {
	const { name, sku, price, stock, category, min_stock } = req.body;
	const { error } = await supabase
		.from("products")
		.insert([{ name, sku, price, stock, category, min_stock }]);

	if (error) console.error(error);
	res.redirect("/admin/products");
});

router.post("/products/delete/:id", async (req, res) => {
	const { error } = await supabase
		.from("products")
		.delete()
		.eq("id", req.params.id);

	if (error) console.error(error);
	res.redirect("/admin/products");
});

// Users Management
router.get("/users", async (req, res) => {
	const { data: users, error } = await supabase
		.from("users")
		.select("*")
		.order("role");

	res.render("admin/users", {
		title: "Gestión de Usuarios",
		users: users || [],
	});
});

router.post("/users", async (req, res) => {
	const { username, password, role } = req.body;
	const hashedPassword = await bcrypt.hash(password, 10);

	const { error } = await supabase
		.from("users")
		.insert([{ username, password_hash: hashedPassword, role }]);

	if (error) console.error(error);
	res.redirect("/admin/users");
});

router.post("/users/delete/:id", async (req, res) => {
	const { error } = await supabase
		.from("users")
		.delete()
		.eq("id", req.params.id);

	if (error) console.error(error);
	res.redirect("/admin/users");
});

module.exports = router;
