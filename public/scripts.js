const apiBase = "/api";




/* ==========================
   LOGIN
========================== */
async function loginUser(event) {

    event.preventDefault();

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value.trim();

    try {

        const res = await fetch(`${apiBase}/users/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await res.json();

        if (res.ok) {

            const userData = {
                username: data.username,
                email: data.email,
                phoneNumber: data.phoneNumber || "",
                uniqueCode: data.uniqueCode
            };

            localStorage.setItem(
                "user",
                JSON.stringify(userData)
            );

            localStorage.setItem(
                "username",
                data.username
            );

            localStorage.setItem(
                "uniqueCode",
                data.uniqueCode
            );

            localStorage.setItem(
                "phoneNumber",
                data.phoneNumber || ""
            );

            localStorage.setItem(
                "role",
                data.role || "user"
            );

        } else {
            alert(data.message || "Login failed");
        }

    } catch (err) {
        console.error(err);
        alert("Server Error");
    }
}


/* ==========================
   LOGOUT
========================== */
function logoutUser() {

    localStorage.removeItem("user");
    localStorage.removeItem("username");
    localStorage.removeItem("uniqueCode");

    window.location.href = "login.html";
}


/* ==========================
   SHOW USER CODE
========================== */
function showUserCode() {

    const user =
        JSON.parse(localStorage.getItem("user"));

    if (
        user &&
        document.getElementById("uniqueCode")
    ) {
        document.getElementById(
            "uniqueCode"
        ).textContent =
            `Your Unique Code: ${user.uniqueCode}`;
    }
}


/* ==========================
   PUBLISH RIDE
========================== */
async function publishRide(event) {

    event.preventDefault();

    const user =
        JSON.parse(localStorage.getItem("user"));

    if (!user) {
        alert("Please login first");
        return;
    }

    const source =
        document.getElementById("source").value;

    const destination =
        document.getElementById("destination").value;

    const date =
        document.getElementById("date").value;

    const time =
        document.getElementById("time").value;

    const seats =
        document.getElementById("seats").value;

    const price =
        document.getElementById("price").value;

    try {

        const res = await fetch(
            `${apiBase}/rides/publish`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: user.username,
                    uniqueCode: user.uniqueCode,
                    source,
                    destination,
                    date,
                    time,
                    seats,
                    price
                })
            }
        );

        const data = await res.json();

        if (res.ok) {
            alert(data.message);
            window.location.href =
                "dashboard.html";
        } else {
            alert(data.message);
        }

    } catch (err) {
        console.error(err);
        alert("Error publishing ride");
    }
}


/* ==========================
   DASHBOARD RIDES
========================== */
async function loadDashboardRides() {

    const user =
        JSON.parse(localStorage.getItem("user"));

    if (!user) return;

    try {


        const res = await fetch(
            `${apiBase}/rides/user/${user.uniqueCode}`
        );

        const rides = await res.json();

        const container =
            document.getElementById("rideList");

        if (!container) return;

        container.innerHTML = "";

        if (!rides.length) {

            container.innerHTML =
                "<p>No rides published.</p>";

            return;
        }

        rides.forEach((ride) => {

            const div =
                document.createElement("div");

            div.className =
                "ride-card";

            div.innerHTML = `
                <p><strong>From:</strong> ${ride.source}</p>
                <p><strong>To:</strong> ${ride.destination}</p>
                <p><strong>Date:</strong> ${ride.date}</p>
                <p><strong>Time:</strong> ${ride.time}</p>
                <p><strong>Seats:</strong> ${ride.seats}</p>
                <p><strong>Price:</strong> ₹${ride.price}</p>
                <p><strong>Ride Code:</strong> ${ride.rideCode}</p>
            `;

            container.appendChild(div);

        });

    } catch (err) {

        console.error(
            "Dashboard loading error:",
            err
        );

    }
}


/* ==========================
   SHOW UNIQUE CODE
========================== */
window.addEventListener(
    "DOMContentLoaded",
    () => {

        const code =
            localStorage.getItem(
                "uniqueCode"
            );

        const element =
            document.getElementById(
                "uniqueCodeDisplay"
            );

        if (
            code &&
            element
        ) {
            element.innerText = code;
        }
    }
);
