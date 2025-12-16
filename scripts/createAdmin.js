const supabase = require("../config/supabase");
const bcrypt = require("bcryptjs");

async function seedAdmin() {
	const username = "admin";
	const password = "admin123";
	const role = "admin";

	try {
		const hashedPassword = await bcrypt.hash(password, 10);

		const { data, error } = await supabase
			.from("users")
			.insert([{ username, password_hash: hashedPassword, role }]);

		if (error) {
			console.error("Error creating admin:", error.message);
		} else {
			console.log("Admin user created successfully!");
			console.log(`Username: ${username}`);
			console.log(`Password: ${password}`);
		}
	} catch (err) {
		console.error("Unexpected error:", err);
	}
}

seedAdmin();
