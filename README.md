# SubAlloc Hub

## Smart Faculty Substitute Management System

SubAlloc Hub is a web-based faculty substitution management system designed to automate the process of allocating substitute faculty when a faculty member is absent.

The system checks faculty eligibility, timetable availability, attendance status, workload limits, and substitution history before assigning a suitable substitute.

## Features

* Faculty login and authentication
* Admin dashboard
* Faculty dashboard
* Faculty management
* Subject management
* Class management
* Room management
* Timetable management
* Faculty attendance management
* Automatic substitute allocation
* Subject eligibility checking
* Faculty availability checking
* Daily substitution workload limits
* Duplicate allocation prevention
* No-substitute handling
* Substitute notifications
* Acknowledge substitution
* Complete substitution
* Admin substitution history
* Reports and analytics
* Faculty timetable
* Faculty attendance history
* Faculty profile
* Responsive desktop and mobile interface

## Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Node.js
* Express.js

### Database

* MySQL

## Project Structure

```text
VCC-SubAlloc Hub/
│
├── backend/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── db.js
│   ├── hash-password.js
│   └── server.js
│
├── database/
│   └── schema.sql
│
├── frontend/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   ├── admin.html
│   ├── admin-faculty.html
│   ├── admin-subjects.html
│   ├── admin-classes.html
│   ├── admin-rooms.html
│   ├── admin-attendance.html
│   ├── admin-notifications.html
│   ├── admin-timetable.html
│   ├── admin-substitutions.html
│   ├── admin-reports.html
│   ├── admin-profile.html
│   ├── faculty.html
│   ├── faculty-today-classes.html
│   ├── faculty-substitutions.html
│   ├── faculty-notifications.html
│   ├── faculty-timetable.html
│   ├── faculty-attendance.html
│   ├── faculty-profile.html
│   └── index.html
│
├── .gitignore
├── package.json
└── package-lock.json
```

## How the System Works

1. Admin or authorized faculty logs into the system.
2. Faculty attendance is recorded.
3. When a faculty member is marked absent, the automatic allocation process checks the timetable for affected classes.
4. The system identifies faculty who are eligible for the required subject.
5. It removes faculty who are absent or on leave.
6. It checks timetable conflicts and daily substitution limits.
7. An available eligible faculty member is selected.
8. A substitution allocation is created.
9. The substitute faculty receives a notification.
10. The substitute can acknowledge the assignment.
11. After completing the class, the substitute can mark it completed.
12. The Admin dashboard and Reports & Analytics reflect the updated status.

## Allocation Rules

The automatic allocation process considers:

* Subject eligibility
* Faculty attendance
* Timetable conflicts
* Faculty availability
* Daily substitution limit
* Existing allocations
* Duplicate prevention

When no suitable faculty member is available, the system records:

```text
NO_SUBSTITUTE_AVAILABLE
```

instead of creating an invalid assignment.

## Security

The application uses session-based authentication and role-based access control.

Protected operations verify the logged-in user and, for faculty self-service actions, ensure that the requested data belongs to the authenticated faculty member.

Sensitive environment configuration is stored outside Git using `.env`.

## Database

The application uses MySQL for storing:

* Users
* Faculty
* Departments
* Subjects
* Classes
* Rooms
* Time slots
* Timetable
* Attendance
* Faculty-subject eligibility
* Notifications
* Substitution allocations

## Running the Project

### Install dependencies

```bash
npm install
```

### Start the backend

```bash
npm run dev
```

Backend:

```text
http://localhost:3000
```

### Open the frontend

Use the frontend through the local development server:

```text
http://localhost:5500/frontend/index.html
```

## Backup

A final database backup was created as:

```text
SubAlloc_Hub_Final_Backup.sql
```

## Project Status

The core SubAlloc Hub functionality has been implemented and tested, including automatic allocation, notifications, acknowledgement/completion workflow, reports, authentication, and responsive faculty/admin pages.
