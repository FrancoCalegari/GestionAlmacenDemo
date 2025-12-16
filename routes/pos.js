const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

// POS Main View
router.get("/", async (req, res) => {
	// Get products
	const { data: products } = await supabase
		.from("products")
		.select("*")
		.gt("stock", 0)
		.order("name");
	// Get active payment methods
	const { data: methods } = await supabase
		.from("payment_methods")
		.select("*")
		.eq("active", true);

	res.render("pos/checkout", {
		title: "Punto de Venta",
		products: products || [],
		paymentMethods: methods || [],
	});
});

// Process Sale
router.post("/checkout", async (req, res) => {
	const { cart, payments } = req.body;
	// Payments: [{ methodId, amount }] (amount is the base debt covered)
	const userId = req.session.user.id;

	if (!cart || cart.length === 0)
		return res.status(400).json({ error: "Carrito vacío" });
	if (!payments || payments.length === 0)
		return res.status(400).json({ error: "Falta método de pago" });

	try {
		// 1. Calculate Product Total (Base)
		let totalBase = 0;
		cart.forEach((item) => (totalBase += item.price * item.quantity));

		// 2. Validate Payment Amount Matches Total Base
		const totalCovered = payments.reduce((sum, p) => sum + p.amount, 0);
		if (Math.abs(totalCovered - totalBase) > 0.1) {
			// Tolerance for float
			return res
				.status(400)
				.json({
					error: `El pago (${totalCovered}) no cubre el total (${totalBase})`,
				});
		}

		// 3. Create Sale Header
		// We accumulate surcharge from payments
		let totalSurcharge = 0;

		// Create sale first
		const { data: sale, error: saleError } = await supabase
			.from("sales")
			.insert([
				{
					user_id: userId,
					total_base: totalBase,
					total_surcharge: 0, // Will update later
				},
			])
			.select()
			.single();

		if (saleError) throw saleError;

		// 4. Record Items & Update Stock
		for (const item of cart) {
			await supabase.from("sale_items").insert([
				{
					sale_id: sale.id,
					product_id: item.id,
					quantity: item.quantity,
					price_at_sale: item.price,
				},
			]);

			// Stock update (simplified)
			const { data: product } = await supabase
				.from("products")
				.select("stock")
				.eq("id", item.id)
				.single();
			await supabase
				.from("products")
				.update({ stock: product.stock - item.quantity })
				.eq("id", item.id);
		}

		// 5. Record Payments & Calculate Surcharges
		for (const p of payments) {
			// Get surcharge % for this method
			const { data: method } = await supabase
				.from("payment_methods")
				.select("surcharge_percent")
				.eq("id", p.methodId)
				.single();

			const surchargePercent = method.surcharge_percent || 0;
			const surchargeAmount = p.amount * (surchargePercent / 100);
			totalSurcharge += surchargeAmount;

			await supabase.from("sale_payments").insert([
				{
					sale_id: sale.id,
					payment_method_id: p.methodId,
					amount: p.amount,
					surcharge_amount: surchargeAmount,
				},
			]);
		}

		// 6. Update Sale with final Surcharge Total
		// (total_base already set, just adding surcharge info if schema supports or just relying on sum of lines)
		await supabase
			.from("sales")
			.update({ total_surcharge: totalSurcharge })
			.eq("id", sale.id);

		res.json({ success: true, saleId: sale.id });
	} catch (err) {
		console.error("Sale Error:", err);
		res.status(500).json({ error: "Error procesando venta: " + err.message });
	}
});

// Ticket View
router.get("/ticket/:id", async (req, res) => {
	const { data: sale } = await supabase
		.from("sales")
		.select(
			`
            *, 
            users(username),
            sale_items(*, products(name)),
            sale_payments(*, payment_methods(name, surcharge_percent))
        `
		)
		.eq("id", req.params.id)
		.single();

	if (!sale) return res.send("Ticket no encontrado");

	res.render("pos/ticket", { sale });
});

module.exports = router;
