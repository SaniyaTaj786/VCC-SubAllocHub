const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const cors = require("cors");
const util = require("util");
const session = require("express-session");
require("dotenv").config();

console.log("Password loaded:", !!process.env.DB_PASSWORD);

const app = express();

app.use(
    cors({
        origin: true,
        credentials: true
    })
);
app.use(express.json());
app.use(
    session({
        secret: process.env.SESSION_SECRET || "suballoc-hub-dev-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false
        }
    })
);


// ======================================================
// MYSQL CONNECTION
// ======================================================

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: "vcc_faculty_suballoc_hub"
});

const queryAsync = util.promisify(db.query).bind(db);


// ======================================================
// TEST MYSQL CONNECTION
// ======================================================

db.connect((err) => {

    if (err) {
        console.error("❌ MySQL connection failed:", err.message);
        return;
    }

    console.log("✅ MySQL connected successfully!");

});


// ======================================================
// TEST API
// ======================================================

app.get("/", (req, res) => {

    res.send("SubAlloc Hub Backend is running!");

});

app.post(
    "/api/auth/logout",
    (req, res) => {

        req.session.destroy((error) => {

            if (error) {

                console.error(
                    "Logout error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to logout"
                });

            }

            res.clearCookie("connect.sid");

            res.json({
                success: true,
                message: "Logout successful"
            });

        });

    }
);

// ======================================================
// LOGIN API
// ======================================================

app.post("/api/login", (req, res) => {

    const { username, password, expectedRole } = req.body;

    if (!["ADMIN", "FACULTY"].includes(expectedRole)) {

        return res.status(400).json({
            success: false,
            message: "Select Admin or Faculty login"
        });

    }

    if (!username || !password) {

        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });

    }

    const sql = `
        SELECT
            user_id,
            username,
            password_hash,
            role,
            is_active
        FROM users
        WHERE username = ?
        LIMIT 1
    `;

    db.query(sql, [username], async (err, results) => {

        if (err) {

            console.error("Login database error:", err);

            return res.status(500).json({
                success: false,
                message: "Database error"
            });

        }

        if (results.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });

        }

        const user = results[0];

        if (!user.is_active) {

            return res.status(403).json({
                success: false,
                message: "User account is inactive"
            });

        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });

        }

        if (user.role !== expectedRole) {

            return res.status(403).json({
                success: false,
                message: `This account is not authorized for the ${expectedRole === "ADMIN" ? "Admin" : "Faculty"} login.`
            });

        }

        req.session.user = {
    user_id: user.user_id,
    username: user.username,
    role: user.role
};

        res.json({

            success: true,

            message: "Login successful",

            user: {
                user_id: user.user_id,
                username: user.username,
                role: user.role
            }

        });

    });

});


// ======================================================
// TEST ROUTE
// ======================================================

app.get("/test", (req, res) => {

    res.send("TEST ROUTE WORKING");

});

// ======================================================
// CHECK LOGIN SESSION
// ======================================================

app.get(
    "/api/auth/me",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({
                success: false,
                message: "Not authenticated"
            });

        }

        res.json({
            success: true,
            user: req.session.user
        });

    }
);

// ======================================================
// ADMIN DASHBOARD STATISTICS
// ======================================================

app.get("/api/dashboard/stats", (req, res) => {

if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}

    const sql = `
        SELECT
            (SELECT COUNT(*) FROM faculty) AS facultyCount,
            (SELECT COUNT(*) FROM subjects) AS subjectCount,
            (SELECT COUNT(*) FROM classes) AS classCount,
            (SELECT COUNT(*) FROM rooms) AS roomCount
    `;

    db.query(sql, (err, results) => {

        if (err) {

            console.error(
                "Dashboard statistics error:",
                err
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load dashboard statistics"
            });

        }

        res.json({

            success: true,

            stats: results[0]

        });

    });

});


// ======================================================
// FACULTY TIMETABLE
// ======================================================

app.get("/api/faculty/timetable/:userId", async (req, res) => {

    try {

        const userId = req.params.userId;

        if (!req.session.user) {

    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });

}

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}



if (
    String(req.session.user.user_id) !==
    String(userId)
) {

    return res.status(403).json({
        success: false,
        message:
            "You can only access your own timetable"
    });

}

        const sql = `
            SELECT
                t.timetable_id,
                t.day_of_week,
                ts.period_number,
                ts.start_time,
                ts.end_time,
                c.class_name,
                s.subject_name,
                t.session_type

            FROM timetable t

            JOIN faculty f
                ON t.faculty_id = f.faculty_id

            JOIN time_slots ts
                ON t.time_slot_id = ts.time_slot_id

            JOIN classes c
                ON t.class_id = c.class_id

            JOIN subjects s
                ON t.subject_id = s.subject_id

            WHERE f.user_id = ?

            ORDER BY
                FIELD(
                    t.day_of_week,
                    'MONDAY',
                    'TUESDAY',
                    'WEDNESDAY',
                    'THURSDAY',
                    'FRIDAY',
                    'SATURDAY'
                ),
                ts.period_number
        `;

        const rows = await queryAsync(
            sql,
            [userId]
        );

        res.json({

            success: true,

            timetable: rows

        });

    } catch (error) {

        console.error(
            "Timetable error:",
            error
        );

        res.status(500).json({

            success: false,

            message: "Unable to load timetable"

        });

    }

});

// ======================================================
// FACULTY PROFILE
// ======================================================

app.get(
    "/api/faculty/profile/:userId",
    async (req, res) => {

        const userId = req.params.userId;
        if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "FACULTY") {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

if (
    String(req.session.user.user_id) !==
    String(userId)
) {
    return res.status(403).json({
        success: false,
        message: "You can only access your own profile"
    });
}

        try {

            const sql = `
                SELECT
                    u.user_id,
                    u.username,
                    u.role,
                    u.is_active,

                    f.faculty_id,
                    f.employee_code,
                    f.full_name,
                    f.email,
                    f.phone,
                    f.designation,
                    f.max_substitutions_per_day,

                    d.department_name

                FROM users u

                INNER JOIN faculty f
                    ON f.user_id = u.user_id

                LEFT JOIN departments d
                    ON f.department_id = d.department_id

                WHERE u.user_id = ?

                LIMIT 1
            `;

            const rows =
                await queryAsync(
                    sql,
                    [userId]
                );

            if (rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Faculty profile not found"
                });

            }

            res.json({
                success: true,
                profile: rows[0]
            });

        } catch (error) {

            console.error(
                "Faculty profile error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load faculty profile"
            });

        }

    }
);

// ======================================================
// FACULTY DASHBOARD COUNTS
// ======================================================

app.get("/api/faculty/dashboard/:userId", async (req, res) => {

    const userId = req.params.userId;
    if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

if (
    String(req.session.user.user_id) !==
    String(userId)
) {
    return res.status(403).json({
        success: false,
        message: "You can only access your own dashboard"
    });
}

    try {

        // Find faculty ID

        const facultyResult = await queryAsync(
            `
            SELECT faculty_id
            FROM faculty
            WHERE user_id = ?
            LIMIT 1
            `,
            [userId]
        );

        if (facultyResult.length === 0) {

            return res.status(404).json({

                success: false,

                message: "Faculty not found"

            });

        }

        const facultyId =
            facultyResult[0].faculty_id;


        // Get today's day

        const todayResult = await queryAsync(
            `
            SELECT DAYNAME(CURDATE()) AS day_name
            `
        );

        const dayOfWeek =
            todayResult[0].day_name.toUpperCase();


        // Today's classes

        const classResult = await queryAsync(
            `
            SELECT COUNT(*) AS count
            FROM timetable
            WHERE faculty_id = ?
            AND day_of_week = ?
            `,
            [
                facultyId,
                dayOfWeek
            ]
        );


        // Faculty substitutions

const substitutionResult =
    await queryAsync(
        `
        SELECT COUNT(*) AS count
        FROM substitution_allocations
        WHERE substitute_faculty_id = ?
        AND status IN ('PENDING', 'ACKNOWLEDGED')
        `,
        [facultyId]
    );


        // Unread notifications

        const notificationResult =
            await queryAsync(
                `
                SELECT COUNT(*) AS count
                FROM notifications
                WHERE user_id = ?
                AND is_read = 0
                `,
                [userId]
            );


        res.json({

            success: true,

            stats: {

                todayClasses:
                    classResult[0].count,

                substitutions:
                    substitutionResult[0].count,

                notifications:
                    notificationResult[0].count

            }

        });

    } catch (error) {

        console.error(
            "Faculty dashboard error:",
            error
        );

        res.status(500).json({

            success: false,

            message: "Unable to load faculty dashboard"

        });

    }

});


// ======================================================
// AUTOMATIC SUBSTITUTION ALLOCATION
// ======================================================

app.post(
    "/api/substitutions/auto-allocate",
    (req, res) => {

if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}

        const allocationDate =
            req.body.date;

        if (!allocationDate) {

            return res.status(400).json({

                success: false,

                message: "Date is required"

            });

        }


        // Convert date to day name

        const dateObj =
            new Date(
                allocationDate + "T00:00:00"
            );

        const days = [

            "SUNDAY",
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY"

        ];

        const dayOfWeek =
            days[dateObj.getDay()];


        // Sunday

        if (dayOfWeek === "SUNDAY") {

    return res.json({

        success: true,

        message:
            "No timetable available for Sunday",

        date:
            allocationDate,

        day:
            dayOfWeek,

        allocations: []

    });

}


        // Find absent faculty

        const attendanceSql = `
            SELECT faculty_id
            FROM attendance
            WHERE attendance_date = ?
            AND status IN ('ABSENT', 'LEAVE')
        `;

        db.query(
            attendanceSql,
            [allocationDate],
            (attendanceErr, absentFaculty) => {

                if (attendanceErr) {

                    console.error(
                        "Attendance error:",
                        attendanceErr
                    );

                    return res.status(500).json({

                        success: false,

                        message:
                            "Unable to check attendance"

                    });

                }


                if (absentFaculty.length === 0) {

    return res.json({

        success: true,

        message:
            "No absent or leave faculty found",

        date:
            allocationDate,

        day:
            dayOfWeek,

        allocations: []

    });

}


                const absentIds =
                    absentFaculty.map(
                        row => row.faculty_id
                    );


                // Find timetable entries

                const timetableSql = `
                    SELECT
                        t.timetable_id,
                        t.class_id,
                        t.subject_id,
                        t.faculty_id,
                        t.room_id,
                        t.time_slot_id,
                        t.day_of_week,
                        t.session_type

                    FROM timetable t

                    WHERE t.faculty_id IN (?)

                    AND t.day_of_week = ?
                `;


                db.query(
                    timetableSql,
                    [
                        absentIds,
                        dayOfWeek
                    ],
                    async (
                        timetableErr,
                        timetableRows
                    ) => {

                        if (timetableErr) {

                            console.error(
                                "Timetable error:",
                                timetableErr
                            );

                            return res.status(500).json({

                                success: false,

                                message:
                                    "Unable to check timetable"

                            });

                        }


                        const allocations = [];


                        try {

                            for (
                                const timetable
                                of timetableRows
                            ) {


                                // Check existing allocation

                                const existingSql = `
    SELECT allocation_id
    FROM substitution_allocations
    WHERE allocation_date = ?
    AND original_timetable_id = ?
    AND absent_faculty_id = ?
    AND status <> 'CANCELLED'
`;


                                const existing = await queryAsync(
    existingSql,
    [
        allocationDate,
        timetable.timetable_id,
        timetable.faculty_id
    ]
);


                                if (
                                    existing.length > 0
                                ) {

                                    continue;

                                }


                                // Find eligible faculty

                             const eligibleSql = `
    SELECT
        f.faculty_id,
        f.full_name,
        f.max_substitutions_per_day,

        (
            SELECT COUNT(*)
            FROM substitution_allocations sa
            WHERE sa.substitute_faculty_id = f.faculty_id
            AND sa.allocation_date = ?
            AND sa.status != 'CANCELLED'
        ) AS substitution_count

    FROM faculty f

    INNER JOIN users u
        ON f.user_id = u.user_id

    WHERE f.faculty_id != ?

    AND u.is_active = 1

    AND NOT EXISTS (
        SELECT 1
        FROM attendance a
        WHERE a.faculty_id = f.faculty_id
        AND a.attendance_date = ?
        AND a.status IN ('ABSENT', 'LEAVE')
    )

    ORDER BY substitution_count ASC,
             f.faculty_id ASC
`;


                            const eligibleFaculty =
    await queryAsync(
        eligibleSql,
        [
            allocationDate,
            timetable.faculty_id,
            allocationDate
        ]
    ); 


                                let selectedFaculty =
                                    null;


                                // Check each eligible faculty

                                for (
                                    const faculty
                                    of eligibleFaculty
                                ) {


                                    // Check whether busy

                                    const busySql = `
                                        SELECT timetable_id

                                        FROM timetable

                                        WHERE faculty_id = ?

                                        AND day_of_week = ?

                                        AND time_slot_id = ?
                                    `;


                                    const busy =
                                        await queryAsync(
                                            busySql,
                                            [
                                                faculty.faculty_id,
                                                dayOfWeek,
                                                timetable.time_slot_id
                                            ]
                                        );


                                    if (
                                        busy.length > 0
                                    ) {

                                        continue;

                                    }


                                    // Check daily limit

                                    const substitutionCountSql = `
                                        SELECT COUNT(*) AS count

                                        FROM substitution_allocations

                                        WHERE substitute_faculty_id = ?

                                        AND allocation_date = ?

                                        AND status != 'CANCELLED'
                                    `;


                                    const countResult =
                                        await queryAsync(
                                            substitutionCountSql,
                                            [
                                                faculty.faculty_id,
                                                allocationDate
                                            ]
                                        );


                                    const currentCount =
                                        countResult[0].count;


                                    if (
                                        currentCount >=
                                        faculty.max_substitutions_per_day
                                    ) {

                                        continue;

                                    }


                                    selectedFaculty =
                                        faculty;

                                    break;

                                }


                                // No substitute

                                if (!selectedFaculty) {

                                    const insertNoSubSql = `
                                        INSERT INTO substitution_allocations
                                        (
                                            allocation_date,
                                            absent_faculty_id,
                                            substitute_faculty_id,
                                            class_id,
                                            subject_id,
                                            room_id,
                                            time_slot_id,
                                            original_timetable_id,
                                            allocation_type,
                                            status,
                                            allocation_reason
                                        )

                                        VALUES
                                        (
                                            ?,
                                            ?,
                                            NULL,
                                            ?,
                                            ?,
                                            ?,
                                            ?,
                                            ?,
                                            'AUTOMATIC',
                                            'NO_SUBSTITUTE_AVAILABLE',
                                            ?
                                        )
                                    `;


                                    await queryAsync(
                                        insertNoSubSql,
                                        [
                                            allocationDate,
                                            timetable.faculty_id,
                                            timetable.class_id,
                                            timetable.subject_id,
                                            timetable.room_id,
                                            timetable.time_slot_id,
                                            timetable.timetable_id,
                                            "No eligible and available faculty found"
                                        ]
                                    );


                                    allocations.push({

                                        timetable_id:
                                            timetable.timetable_id,

                                        absent_faculty_id:
                                            timetable.faculty_id,

                                        substitute_faculty_id:
                                            null,

                                        status:
                                            "NO_SUBSTITUTE_AVAILABLE"

                                    });


                                    continue;

                                }


                                // Create allocation

                                const insertSql = `
                                    INSERT INTO substitution_allocations
                                    (
                                        allocation_date,
                                        absent_faculty_id,
                                        substitute_faculty_id,
                                        class_id,
                                        subject_id,
                                        room_id,
                                        time_slot_id,
                                        original_timetable_id,
                                        allocation_type,
                                        status,
                                        allocation_reason
                                    )

                                    VALUES
                                    (
                                        ?,
                                        ?,
                                        ?,
                                        ?,
                                        ?,
                                        ?,
                                        ?,
                                        ?,
                                        'AUTOMATIC',
                                        'PENDING',
                                        ?
                                    )
                                `;


                                const insertResult =
                                    await queryAsync(
                                        insertSql,
                                        [
                                            allocationDate,
                                            timetable.faculty_id,
                                            selectedFaculty.faculty_id,
                                            timetable.class_id,
                                            timetable.subject_id,
                                            timetable.room_id,
                                            timetable.time_slot_id,
                                            timetable.timetable_id,
                                            "Automatically selected based on subject eligibility, availability and daily limit"
                                        ]
                                    );


                                // ==================================================
                                // CREATE NOTIFICATION
                                // ==================================================

                                const notificationSql = `
                                    INSERT INTO notifications
                                    (
                                        user_id,
                                        allocation_id,
                                        title,
                                        message,
                                        notification_type,
                                        is_read
                                    )

                                    SELECT
                                        f.user_id,
                                        ?,
                                        'Substitution Assigned',
                                        ?,
                                        'SUBSTITUTION_ASSIGNED',
                                        0

                                    FROM faculty f

                                    WHERE f.faculty_id = ?

                                    AND f.user_id IS NOT NULL
                                `;


                                const notificationMessage =
                                    `You have been assigned as substitute for timetable ${timetable.timetable_id} on ${allocationDate}.`;


                                await queryAsync(
                                    notificationSql,
                                    [
                                        insertResult.insertId,
                                        notificationMessage,
                                        selectedFaculty.faculty_id
                                    ]
                                );


                                allocations.push({

                                    timetable_id:
                                        timetable.timetable_id,

                                    absent_faculty_id:
                                        timetable.faculty_id,

                                    substitute_faculty_id:
                                        selectedFaculty.faculty_id,

                                    substitute_name:
                                        selectedFaculty.full_name,

                                    class_id:
                                        timetable.class_id,

                                    subject_id:
                                        timetable.subject_id,

                                    time_slot_id:
                                        timetable.time_slot_id,

                                    status:
                                        "PENDING"

                                });

                            }


                            return res.json({

                                success: true,

                                message:
                                    "Automatic substitution allocation completed",

                                date:
                                    allocationDate,

                                day:
                                    dayOfWeek,

                                allocations:
                                    allocations

                            });


                        } catch (error) {

                            console.error(
                                "Automatic allocation error:",
                                error
                            );

                            return res.status(500).json({
    success: false,
    message:
        "Automatic allocation failed: " +
        error.message
});

                        }

                    }

                );

            }

        );

    }
);


// ======================================================
// MANUAL / INDIVIDUAL SUBSTITUTION ALLOCATION
// ======================================================

app.post(
    "/api/substitutions/allocate",
    (req, res) => {

        const {
            absent_faculty_id,
            timetable_id
        } = req.body;


        if (
            !absent_faculty_id ||
            !timetable_id
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "absent_faculty_id and timetable_id are required"

            });

        }


        // Get timetable information

        const timetableSql = `
            SELECT
                t.timetable_id,
                t.class_id,
                t.subject_id,
                t.faculty_id,
                t.room_id,
                t.time_slot_id,
                t.day_of_week,
                c.class_name,
                s.subject_name,
                ts.period_number,
                ts.start_time,
                ts.end_time

            FROM timetable t

            JOIN classes c
                ON t.class_id = c.class_id

            JOIN subjects s
                ON t.subject_id = s.subject_id

            JOIN time_slots ts
                ON t.time_slot_id = ts.time_slot_id

            WHERE t.timetable_id = ?

            AND t.faculty_id = ?

            LIMIT 1
        `;


        db.query(
            timetableSql,
            [
                timetable_id,
                absent_faculty_id
            ],
            (err, timetableResults) => {

                if (err) {

                    console.error(
                        "Timetable lookup error:",
                        err
                    );

                    return res.status(500).json({

                        success: false,

                        message:
                            "Unable to find timetable"

                    });

                }


                if (
                    timetableResults.length === 0
                ) {

                    return res.status(404).json({

                        success: false,

                        message:
                            "Timetable entry not found"

                    });

                }


                const timetable =
                    timetableResults[0];


                // Find eligible + free faculty

                const candidateSql = `
                    SELECT
                        f.faculty_id,
                        f.user_id,
                        f.full_name,
                        f.max_substitutions_per_day

                    FROM faculty f

                    JOIN faculty_subjects fs
                        ON f.faculty_id =
                           fs.faculty_id

                    WHERE fs.subject_id = ?

                    AND f.faculty_id <> ?

                    AND NOT EXISTS
                    (
                        SELECT 1

                        FROM timetable busy

                        WHERE busy.faculty_id =
                              f.faculty_id

                        AND busy.day_of_week = ?

                        AND busy.time_slot_id = ?
                    )

                    AND
                    (
                        SELECT COUNT(*)

                        FROM substitution_allocations sa

                        WHERE sa.substitute_faculty_id =
                              f.faculty_id

                        AND sa.allocation_date =
                            CURDATE()

                        AND sa.status <> 'CANCELLED'

                    )
                    <
                    f.max_substitutions_per_day

                    ORDER BY
                    (
                        SELECT COUNT(*)

                        FROM substitution_allocations sa2

                        WHERE sa2.substitute_faculty_id =
                              f.faculty_id

                        AND sa2.allocation_date =
                            CURDATE()

                        AND sa2.status <> 'CANCELLED'

                    ) ASC,

                    f.faculty_id ASC

                    LIMIT 1
                `;


                db.query(
                    candidateSql,
                    [
                        timetable.subject_id,
                        absent_faculty_id,
                        timetable.day_of_week,
                        timetable.time_slot_id
                    ],
                    (err, candidates) => {

                        if (err) {

                            console.error(
                                "Substitute search error:",
                                err
                            );

                            return res.status(500).json({

                                success: false,

                                message:
                                    "Unable to find substitute"

                            });

                        }


                        // No substitute

                        if (
                            candidates.length === 0
                        ) {

                            const noSubSql = `
                                INSERT INTO substitution_allocations
                                (
                                    allocation_date,
                                    absent_faculty_id,
                                    substitute_faculty_id,
                                    class_id,
                                    subject_id,
                                    room_id,
                                    time_slot_id,
                                    original_timetable_id,
                                    allocation_type,
                                    status,
                                    allocation_reason
                                )

                                VALUES
                                (
                                    CURDATE(),
                                    ?,
                                    NULL,
                                    ?,
                                    ?,
                                    ?,
                                    ?,
                                    ?,
                                    'AUTOMATIC',
                                    'NO_SUBSTITUTE_AVAILABLE',
                                    ?
                                )
                            `;


                            const reason =
                                "No eligible and available substitute faculty found";


                            db.query(
                                noSubSql,
                                [
                                    absent_faculty_id,
                                    timetable.class_id,
                                    timetable.subject_id,
                                    timetable.room_id,
                                    timetable.time_slot_id,
                                    timetable.timetable_id,
                                    reason
                                ],
                                (err, result) => {

                                    if (err) {

                                        console.error(
                                            "No-substitute allocation error:",
                                            err
                                        );

                                        return res.status(500).json({

                                            success: false,

                                            message:
                                                "Unable to create allocation"

                                        });

                                    }


                                    return res.json({

                                        success: true,

                                        allocated: false,

                                        message:
                                            "No eligible substitute available",

                                        allocation_id:
                                            result.insertId

                                    });

                                }
                            );


                            return;

                        }


                        // Substitute found

                        const substitute =
                            candidates[0];


                        const allocationSql = `
                            INSERT INTO substitution_allocations
                            (
                                allocation_date,
                                absent_faculty_id,
                                substitute_faculty_id,
                                class_id,
                                subject_id,
                                room_id,
                                time_slot_id,
                                original_timetable_id,
                                allocation_type,
                                status,
                                allocation_reason
                            )

                            VALUES
                            (
                                CURDATE(),
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'AUTOMATIC',
                                'PENDING',
                                ?
                            )
                        `;


                        const reason =
                            "Automatically allocated based on subject eligibility, availability and substitution limit";


                        db.query(
                            allocationSql,
                            [
                                absent_faculty_id,
                                substitute.faculty_id,
                                timetable.class_id,
                                timetable.subject_id,
                                timetable.room_id,
                                timetable.time_slot_id,
                                timetable.timetable_id,
                                reason
                            ],
                            (err, allocationResult) => {

                                if (err) {

                                    console.error(
                                        "Allocation creation error:",
                                        err
                                    );

                                    return res.status(500).json({

                                        success: false,

                                        message:
                                            "Unable to create substitution"

                                    });

                                }


                                const allocationId =
                                    allocationResult.insertId;


                                // Notify substitute faculty

                                if (
                                    substitute.user_id
                                ) {

                                    const notificationSql = `
                                        INSERT INTO notifications
                                        (
                                            user_id,
                                            allocation_id,
                                            title,
                                            message,
                                            notification_type,
                                            is_read
                                        )

                                        VALUES
                                        (
                                            ?,
                                            ?,
                                            ?,
                                            ?,
                                            'SUBSTITUTION_ASSIGNED',
                                            0
                                        )
                                    `;


                                    const title =
                                        "New Substitution Assigned";


                                    const message =
                                        `You have been assigned as substitute for ${timetable.class_name} - ${timetable.subject_name}, Period ${timetable.period_number} (${timetable.start_time} - ${timetable.end_time}).`;


                                    db.query(
                                        notificationSql,
                                        [
                                            substitute.user_id,
                                            allocationId,
                                            title,
                                            message
                                        ],
                                        (err) => {

                                            if (err) {

                                                console.error(
                                                    "Notification error:",
                                                    err
                                                );

                                            }


                                            return res.json({

                                                success: true,

                                                allocated: true,

                                                message:
                                                    "Substitution allocated successfully",

                                                allocation_id:
                                                    allocationId,

                                                substitute: {

                                                    faculty_id:
                                                        substitute.faculty_id,

                                                    full_name:
                                                        substitute.full_name

                                                },

                                                class_name:
                                                    timetable.class_name,

                                                subject_name:
                                                    timetable.subject_name,

                                                period:
                                                    timetable.period_number

                                            });

                                        }
                                    );


                                } else {

                                    return res.json({

                                        success: true,

                                        allocated: true,

                                        message:
                                            "Substitution allocated successfully",

                                        allocation_id:
                                            allocationId,

                                        substitute: {

                                            faculty_id:
                                                substitute.faculty_id,

                                            full_name:
                                                substitute.full_name

                                        },

                                        class_name:
                                            timetable.class_name,

                                        subject_name:
                                            timetable.subject_name,

                                        period:
                                            timetable.period_number

                                    });

                                }

                            }
                        );

                    }
                );

            }
        );

    }
);


// ======================================================
// GET FACULTY SUBSTITUTIONS
// ======================================================

app.get(
    "/api/substitutions/:userId",
    async (req, res) => {

        const userId =
            req.params.userId;

        if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

if (
    String(req.session.user.user_id) !==
    String(userId)
) {
    return res.status(403).json({
        success: false,
        message: "You can only access your own substitutions"
    });
}    

        try {

            const sql = `
                SELECT
                    sa.allocation_id,
                    sa.allocation_date,
                    sa.status,
                    sa.allocation_type,
                    sa.allocation_reason,

                    af.full_name AS absent_faculty,

                    sf.full_name AS substitute_faculty,

                    c.class_name,

                    s.subject_code,
                    s.subject_name,

                    ts.period_number,
                    ts.slot_name,
                    ts.start_time,
                    ts.end_time,

                    r.room_number

                FROM substitution_allocations sa

                INNER JOIN faculty sf
                    ON sa.substitute_faculty_id =
                       sf.faculty_id

                INNER JOIN faculty af
                    ON sa.absent_faculty_id =
                       af.faculty_id

                INNER JOIN classes c
                    ON sa.class_id =
                       c.class_id

                INNER JOIN subjects s
                    ON sa.subject_id =
                       s.subject_id

                INNER JOIN time_slots ts
                    ON sa.time_slot_id =
                       ts.time_slot_id

                LEFT JOIN rooms r
                    ON sa.room_id =
                       r.room_id

                WHERE sf.user_id = ?

                ORDER BY
                    sa.allocation_date DESC,
                    ts.period_number ASC
            `;


            const substitutions =
                await queryAsync(
                    sql,
                    [userId]
                );


            res.json({

                success: true,

                substitutions:
                    substitutions

            });


        } catch (error) {

            console.error(
                "Substitution error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to load substitutions"

            });

        }

    }
);


// ======================================================
// ACKNOWLEDGE SUBSTITUTION
// ======================================================

app.put(
    "/api/substitutions/acknowledge/:allocationId",
    (req, res) => {

        const allocationId =
            req.params.allocationId;

        if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}


        const sql = `
    UPDATE substitution_allocations sa

    INNER JOIN faculty f
        ON sa.substitute_faculty_id = f.faculty_id

    SET sa.status = 'ACKNOWLEDGED'

    WHERE sa.allocation_id = ?
    AND f.user_id = ?
    AND sa.status = 'PENDING'
`;


        db.query(
            sql,
            [allocationId, req.session.user.user_id],
            (err, result) => {

                if (err) {

                    console.error(
                        "ACKNOWLEDGE ERROR:",
                        err
                    );

                    return res.status(500).json({

                        success: false,

                        message:
                            "Unable to acknowledge substitution"

                    });

                }


                if (
                    result.affectedRows === 0
                ) {

                    return res.json({

                        success: false,

                        message:
                            "Substitution cannot be acknowledged"

                    });

                }


                res.json({

                    success: true,

                    message:
                        "Substitution acknowledged successfully"

                });

            }
        );

    }
);

// ======================================================
// MARK ALL NOTIFICATIONS AS READ
// ======================================================

app.put("/api/notifications/read-all/:userId", async (req, res) => {

    const userId = req.params.userId;

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

    try {

        const sql = `
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = ?
            AND is_read = 0
        `;

        await queryAsync(
            sql,
            [userId]
        );

        res.json({
            success: true,
            message: "All notifications marked as read"
        });

    } catch (error) {

        console.error(
            "Mark all notifications read error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to mark notifications as read"
        });

    }

});

// ======================================================
// GET ALL NOTIFICATIONS FOR ADMIN
// ======================================================

app.get("/api/admin/notifications", async (req, res) => {

if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}

    try {

        const sql = `
            SELECT
                n.notification_id,
                n.allocation_id,
                n.title,
                n.message,
                n.notification_type,
                n.is_read,
                n.created_at,

                u.username

            FROM notifications n

            LEFT JOIN users u
                ON n.user_id = u.user_id

            ORDER BY
                n.created_at DESC,
                n.notification_id DESC
        `;

        const notifications =
            await queryAsync(sql);

        res.json({
            success: true,
            notifications: notifications
        });

    } catch (error) {

        console.error(
            "Admin notifications error:",
            error
        );

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ======================================================
// FACULTY NOTIFICATIONS
// ======================================================

app.get("/api/notifications/:userId",
    async (req, res) => {

        const userId =
            req.params.userId;

            if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

if (
    String(req.session.user.user_id) !==
    String(userId)
) {
    return res.status(403).json({
        success: false,
        message: "You can only access your own notifications"
    });
}


        try {

            const sql = `
                SELECT
                    notification_id,
                    allocation_id,
                    title,
                    message,
                    notification_type,
                    is_read,
                    created_at

                FROM notifications

                WHERE user_id = ?

                ORDER BY created_at DESC
            `;


            const notifications =
                await queryAsync(
                    sql,
                    [userId]
                );


            res.json({

                success: true,

                notifications:
                    notifications

            });


        } catch (error) {

            console.error(
                "Notification error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to load notifications"

            });

        }

    }
);

// ======================================================
// GET ALL SUBJECTS
// ======================================================

app.get("/api/subjects", async (req, res) => {

if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}

    try {

        const sql = `
            SELECT
                s.subject_id,
                s.subject_code,
                s.subject_name,
                COALESCE(
                    d.department_name,
                    '—'
                ) AS department,
                s.semester

            FROM subjects s

            LEFT JOIN departments d
                ON s.department_id = d.department_id

            ORDER BY
                s.semester ASC,
                s.subject_code ASC,
                s.subject_name ASC
        `;


        const subjects =
            await queryAsync(sql);


        res.json({

            success: true,

            subjects: subjects

        });


    } catch (error) {

        console.error(
            "Subjects API error:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Unable to load subjects"

        });

    }

});


// ======================================================
// SERVER START
// ======================================================

const PORT = 3000;

// ======================================================
// MARK NOTIFICATION AS READ
// ======================================================

app.put("/api/notifications/read/:notificationId", async (req, res) => {

    const notificationId =
        req.params.notificationId;

if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

    try {

        const sql = `
            UPDATE notifications
            SET is_read = 1
            WHERE notification_id = ?
            AND user_id = ?
        `;

        await queryAsync(
    sql,
    [
        notificationId,
        req.session.user.user_id
    ]
);

        res.json({
            success: true,
            message: "Notification marked as read"
        });

    } catch (error) {

        console.error(
            "Mark notification read error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to mark notification as read"
        });

    }

});

// ======================================================
// MARK SUBSTITUTION AS COMPLETED
// ======================================================

app.put("/api/substitutions/complete/:allocationId", async (req, res) => {

    const allocationId = req.params.allocationId;
    if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (
    req.session.user.role !== "FACULTY" &&
    req.session.user.role !== "ADMIN"
) {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

    try {

        const sql = `
    UPDATE substitution_allocations sa

    INNER JOIN faculty f
        ON sa.substitute_faculty_id = f.faculty_id

    SET sa.status = 'COMPLETED'

    WHERE sa.allocation_id = ?
    AND f.user_id = ?
    AND sa.status = 'ACKNOWLEDGED'
`;

        const result = await queryAsync(
            sql,
            [allocationId,
            req.session.user.user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: "Substitution not found or it has not been acknowledged yet."
            });
        }

        res.json({
            success: true,
            message: "Substitution marked as completed successfully."
        });

    } catch (error) {

        console.error("Complete substitution error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to complete substitution."
        });

    }

});

// ======================================================
// MARK FACULTY ATTENDANCE
// ======================================================

app.post("/api/attendance", async (req, res) => {

if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}

    const {
        faculty_id,
        attendance_date,
        status,
        remarks,
        marked_by
    } = req.body;

    if (
        !faculty_id ||
        !attendance_date ||
        !status
    ) {

        return res.status(400).json({
            success: false,
            message: "Faculty, date and status are required"
        });

    }

    try {

        // Check whether attendance already exists
        const existing = await queryAsync(
            `
            SELECT attendance_id
            FROM attendance
            WHERE faculty_id = ?
            AND attendance_date = ?
            `,
            [
                faculty_id,
                attendance_date
            ]
        );

        if (existing.length > 0) {

            // Update existing attendance
            await queryAsync(
                `
                UPDATE attendance
                SET
                    status = ?,
                    remarks = ?,
                    marked_by = ?
                WHERE attendance_id = ?
                `,
                [
                    status,
                    remarks || null,
                    marked_by || null,
                    existing[0].attendance_id
                ]
            );

        } else {

            // Insert new attendance
            await queryAsync(
                `
                INSERT INTO attendance
                (
                    faculty_id,
                    attendance_date,
                    status,
                    remarks,
                    marked_by
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    faculty_id,
                    attendance_date,
                    status,
                    remarks || null,
                    marked_by || null
                ]
            );

        }

        res.json({
    success: true,
    existing: existing.length > 0,
    message: existing.length > 0
        ? "Attendance record already existed and was updated successfully."
        : "Attendance saved successfully"
});

    } catch (error) {

        console.error(
            "Attendance error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to save attendance"
        });

    }

});

// ======================================================
// GET CURRENT FACULTY ATTENDANCE
// ======================================================

app.get(
    "/api/faculty/attendance/:userId",
    async (req, res) => {

        const userId = req.params.userId;

    if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "FACULTY") {
    return res.status(403).json({
        success: false,
        message: "Faculty access required"
    });
}

if (
    String(req.session.user.user_id) !==
    String(userId)
) {
    return res.status(403).json({
        success: false,
        message: "You can only access your own attendance"
    });
}


        try {

            const sql = `
                SELECT
                    a.attendance_id,
                    a.attendance_date,
                    a.status,
                    a.remarks,
                    a.marked_by,
                    f.full_name AS faculty_name,
                    f.employee_code

                FROM attendance a

                INNER JOIN faculty f
                    ON a.faculty_id = f.faculty_id

                WHERE f.user_id = ?

                ORDER BY
                    a.attendance_date DESC,
                    a.attendance_id DESC
            `;

            const attendance =
                await queryAsync(
                    sql,
                    [userId]
                );

            res.json({
                success: true,
                attendance: attendance
            });

        } catch (error) {

            console.error(
                "Faculty attendance error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load faculty attendance"
            });

        }

    }
);

// ======================================================
// GET ALL FACULTY
// ======================================================

app.get("/api/faculty", async (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}

     try {

        const sql = `
            SELECT
                faculty_id,
                user_id,
                full_name,
                employee_code
            FROM faculty
            ORDER BY full_name
        `;

        const faculty =
            await queryAsync(sql);

        res.json({
            success: true,
            faculty: faculty
        });

    } catch (error) {

        console.error(
            "Faculty list error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to load faculty"
        });

    }

});

// ======================================================
// GET ALL CLASSES
// ======================================================

app.get("/api/classes", async (req, res) => {

 if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}   

    try {

        const sql = `
            SELECT *
            FROM classes
            ORDER BY class_id ASC
        `;

        const classes = await queryAsync(sql);

        res.json({
            success: true,
            classes: classes
        });

    } catch (error) {

        console.error(
            "Classes API error:",
            error
        );

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ======================================================
// GET ALL TIMETABLE ENTRIES FOR ADMIN
// ======================================================

app.get("/api/admin/timetable", async (req, res) => {

if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}

    try {

        const sql = `
            SELECT
                t.timetable_id,
                t.day_of_week,

                ts.period_number,
                ts.slot_name,
                ts.start_time,
                ts.end_time,

                c.class_name,

                s.subject_code,
                s.subject_name,

                f.full_name AS faculty_name,

                r.room_number,

                t.session_type

            FROM timetable t

            LEFT JOIN classes c
                ON t.class_id = c.class_id

            LEFT JOIN subjects s
                ON t.subject_id = s.subject_id

            LEFT JOIN faculty f
                ON t.faculty_id = f.faculty_id

            LEFT JOIN rooms r
                ON t.room_id = r.room_id

            LEFT JOIN time_slots ts
                ON t.time_slot_id = ts.time_slot_id

            ORDER BY
                FIELD(
                    t.day_of_week,
                    'MONDAY',
                    'TUESDAY',
                    'WEDNESDAY',
                    'THURSDAY',
                    'FRIDAY',
                    'SATURDAY'
                ),
                ts.period_number ASC,
                c.class_name ASC
        `;

        const timetable =
            await queryAsync(sql);

        res.json({
            success: true,
            timetable: timetable
        });

    } catch (error) {

        console.error(
            "Admin timetable error:",
            error
        );

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ======================================================
// GET ALL ROOMS
// ======================================================

app.get("/api/rooms", async (req, res) => {

    try {

        const sql = `
            SELECT *
            FROM rooms
            ORDER BY room_id ASC
        `;

        const rooms =
            await queryAsync(sql);

        res.json({
            success: true,
            rooms: rooms
        });

    } catch (error) {

        console.error(
            "Rooms API error:",
            error
        );

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ======================================================
// GET ALL ATTENDANCE RECORDS
// ======================================================

app.get("/api/attendance", async (req, res) => {

    try {

        const sql = `
            SELECT
                a.attendance_id,
                a.faculty_id,
                f.full_name AS faculty_name,
                a.attendance_date,
                a.status,
                a.remarks,
                a.marked_by
            FROM attendance a

            LEFT JOIN faculty f
                ON a.faculty_id = f.faculty_id

            ORDER BY
                a.attendance_date DESC,
                a.attendance_id DESC
        `;

        const attendance =
            await queryAsync(sql);

        res.json({
            success: true,
            attendance: attendance
        });

    } catch (error) {

        console.error(
            "Attendance API error:",
            error
        );

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// Get all substitution allocations for the Admin dashboard
app.get("/api/admin/substitutions", (req, res) => {

    if (!req.session.user) {
    return res.status(401).json({
        success: false,
        message: "Not authenticated"
    });
}

if (req.session.user.role !== "ADMIN") {
    return res.status(403).json({
        success: false,
        message: "Admin access required"
    });
}
    const sql = `
    SELECT
        sa.allocation_id,
        sa.allocation_date,

        absent.full_name AS absent_faculty,

        substitute.full_name AS substitute_faculty,

        c.class_name,
        s.subject_name,
        ts.slot_name,

        sa.status,
        sa.allocation_reason

    FROM substitution_allocations sa

    LEFT JOIN faculty absent
        ON sa.absent_faculty_id = absent.faculty_id

    LEFT JOIN faculty substitute
        ON sa.substitute_faculty_id = substitute.faculty_id

    LEFT JOIN classes c
        ON sa.class_id = c.class_id

    LEFT JOIN subjects s
        ON sa.subject_id = s.subject_id

    LEFT JOIN time_slots ts
        ON sa.time_slot_id = ts.time_slot_id

    ORDER BY
        sa.allocation_date DESC,
        sa.allocation_id DESC
`;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error loading admin substitutions:", err);
            return res.status(500).json({
                success: false,
                message: "Failed to load substitution allocations"
            });
        }

        res.json({
            success: true,
            allocations: results
        });
    });
});

// ======================================================
// ADMIN REPORTS - SUBSTITUTION SUMMARY
// ======================================================

app.get("/api/admin/reports/substitutions", async (req, res) => {

    try {

        const {
            from_date,
            to_date
        } = req.query;


        // ------------------------------------------------
        // BUILD OPTIONAL DATE FILTER
        // ------------------------------------------------

        let dateCondition = "";
        const params = [];

        if (from_date && to_date) {

            dateCondition =
                "WHERE sa.allocation_date BETWEEN ? AND ?";

            params.push(
                from_date,
                to_date
            );

        } else if (from_date) {

            dateCondition =
                "WHERE sa.allocation_date >= ?";

            params.push(
                from_date
            );

        } else if (to_date) {

            dateCondition =
                "WHERE sa.allocation_date <= ?";

            params.push(
                to_date
            );

        }


        // ------------------------------------------------
        // SUMMARY
        // ------------------------------------------------

        const summarySql = `
            SELECT

                COUNT(*) AS total_allocations,

                SUM(
                    CASE
                        WHEN sa.substitute_faculty_id IS NOT NULL
                        AND sa.status != 'CANCELLED'
                        THEN 1
                        ELSE 0
                    END
                ) AS assigned_allocations,

                SUM(
                    CASE
                        WHEN sa.status = 'COMPLETED'
                        THEN 1
                        ELSE 0
                    END
                ) AS completed_allocations,

                SUM(
                    CASE
                        WHEN sa.status = 'PENDING'
                        THEN 1
                        ELSE 0
                    END
                ) AS pending_allocations,

                SUM(
                    CASE
                        WHEN sa.status = 'NO_SUBSTITUTE_AVAILABLE'
                        THEN 1
                        ELSE 0
                    END
                ) AS no_substitute_allocations

            FROM substitution_allocations sa

            ${dateCondition}
        `;


        const summaryRows =
            await queryAsync(
                summarySql,
                params
            );


        // ------------------------------------------------
        // DATE-WISE ACTIVITY
        // ------------------------------------------------

        const dailySql = `
            SELECT

                sa.allocation_date AS report_date,

                COUNT(*) AS total_allocations,

                SUM(
                    CASE
                        WHEN sa.substitute_faculty_id IS NOT NULL
                        AND sa.status != 'CANCELLED'
                        THEN 1
                        ELSE 0
                    END
                ) AS assigned_allocations,

                SUM(
                    CASE
                        WHEN sa.status = 'COMPLETED'
                        THEN 1
                        ELSE 0
                    END
                ) AS completed_allocations,

                SUM(
                    CASE
                        WHEN sa.status = 'PENDING'
                        THEN 1
                        ELSE 0
                    END
                ) AS pending_allocations,

                SUM(
                    CASE
                        WHEN sa.status = 'NO_SUBSTITUTE_AVAILABLE'
                        THEN 1
                        ELSE 0
                    END
                ) AS no_substitute_allocations

            FROM substitution_allocations sa

            ${dateCondition}

            GROUP BY sa.allocation_date

            ORDER BY sa.allocation_date DESC
        `;


        const dailyActivity =
            await queryAsync(
                dailySql,
                params
            );


        // ------------------------------------------------
        // FACULTY WORKLOAD
        // ------------------------------------------------

        const workloadSql = `
            SELECT

                f.faculty_id,

                f.full_name AS faculty_name,

                COUNT(
                    CASE
                        WHEN sa.status != 'CANCELLED'
                        THEN sa.allocation_id
                    END
                ) AS substitution_count,

                COUNT(
                    CASE
                        WHEN sa.status = 'COMPLETED'
                        THEN sa.allocation_id
                    END
                ) AS completed_count

            FROM faculty f

            LEFT JOIN substitution_allocations sa

                ON f.faculty_id =
                   sa.substitute_faculty_id

                ${dateCondition
                    ? "AND " + dateCondition.replace("WHERE ", "")
                    : ""
                }

            GROUP BY
                f.faculty_id,
                f.full_name

            HAVING
                substitution_count > 0

            ORDER BY
                substitution_count DESC,
                f.full_name ASC
        `;


        const workloadParams =
            params.slice();


        const workload =
            await queryAsync(
                workloadSql,
                workloadParams
            );


        // ------------------------------------------------
        // RESPONSE
        // ------------------------------------------------

        res.json({

            success: true,

            filters: {
                from_date:
                    from_date || null,

                to_date:
                    to_date || null
            },

            summary: {

                total_allocations:
                    Number(
                        summaryRows[0]?.total_allocations || 0
                    ),

                assigned_allocations:
                    Number(
                        summaryRows[0]?.assigned_allocations || 0
                    ),

                completed_allocations:
                    Number(
                        summaryRows[0]?.completed_allocations || 0
                    ),

                pending_allocations:
                    Number(
                        summaryRows[0]?.pending_allocations || 0
                    ),

                no_substitute_allocations:
                    Number(
                        summaryRows[0]?.no_substitute_allocations || 0
                    )
            },

            daily_activity:
                dailyActivity,

            workload:
                workload

        });

    } catch (error) {

        console.error(
            "Substitution reports error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Unable to load substitution reports",

            error:
                error.message

        });

    }

});

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 Server running on http://localhost:${PORT}`
        );

    }
);