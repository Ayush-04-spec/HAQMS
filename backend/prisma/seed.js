const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  await prisma.queueToken.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();

  // Hash password for all users
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create Users
  const admin = await prisma.user.create({
    data: {
      email: 'admin@haqms.com',
      password: hashedPassword,
      role: 'admin',
      name: 'System Administrator',
    },
  });

  const receptionist = await prisma.user.create({
    data: {
      email: 'reception1@haqms.com',
      password: hashedPassword,
      role: 'receptionist',
      name: 'Jane Receptionist',
    },
  });

  const doctorUser1 = await prisma.user.create({
    data: {
      email: 'doctor1@haqms.com',
      password: hashedPassword,
      role: 'doctor',
      name: 'Dr. John Smith',
    },
  });

  const doctorUser2 = await prisma.user.create({
    data: {
      email: 'doctor2@haqms.com',
      password: hashedPassword,
      role: 'doctor',
      name: 'Dr. Sarah Johnson',
    },
  });

  // Create Doctor Profiles
  const doctor1 = await prisma.doctor.create({
    data: {
      userId: doctorUser1.id,
      specialization: 'General Medicine',
      licenseNumber: 'MD-2024-001',
    },
  });

  const doctor2 = await prisma.doctor.create({
    data: {
      userId: doctorUser2.id,
      specialization: 'Cardiology',
      licenseNumber: 'MD-2024-002',
    },
  });

  // Create Patients
  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        name: 'Alice Williams',
        email: 'alice@example.com',
        phone: '555-0101',
        dateOfBirth: new Date('1985-03-15'),
        address: '123 Main St, City',
        medicalHistory: 'Hypertension, controlled with medication',
      },
    }),
    prisma.patient.create({
      data: {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        phone: '555-0102',
        dateOfBirth: new Date('1990-07-22'),
        address: '456 Oak Ave, City',
        medicalHistory: 'Diabetes Type 2, regular checkups required',
      },
    }),
    prisma.patient.create({
      data: {
        name: 'Carol Davis',
        email: 'carol@example.com',
        phone: '555-0103',
        dateOfBirth: new Date('1978-11-30'),
        address: '789 Pine Rd, City',
        medicalHistory: 'Asthma, uses inhaler as needed',
      },
    }),
    prisma.patient.create({
      data: {
        name: 'David Miller',
        email: 'david@example.com',
        phone: '555-0104',
        dateOfBirth: new Date('1995-05-18'),
        address: '321 Elm St, City',
        medicalHistory: 'No significant medical history',
      },
    }),
    prisma.patient.create({
      data: {
        name: 'Clark Kent',
        email: 'clark@example.com',
        phone: '555-0105',
        dateOfBirth: new Date('1980-06-18'),
        address: '1938 Sullivan Lane, Smallville',
        medicalHistory: null, // Intentionally null for testing
      },
    }),
    prisma.patient.create({
      data: {
        name: 'Bruce Wayne',
        email: 'bruce@example.com',
        phone: '555-0106',
        dateOfBirth: new Date('1982-02-19'),
        address: '1007 Mountain Drive, Gotham',
        medicalHistory: null, // Intentionally null for testing
      },
    }),
  ]);

  // Create Appointments
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  await Promise.all([
    prisma.appointment.create({
      data: {
        patientId: patients[0].id,
        doctorId: doctor1.id,
        doctorUserId: doctorUser1.id,
        appointmentDate: new Date(today.setHours(10, 0, 0, 0)),
        status: 'scheduled',
        notes: 'Regular checkup',
      },
    }),
    prisma.appointment.create({
      data: {
        patientId: patients[1].id,
        doctorId: doctor1.id,
        doctorUserId: doctorUser1.id,
        appointmentDate: new Date(today.setHours(11, 0, 0, 0)),
        status: 'scheduled',
        notes: 'Follow-up for diabetes management',
      },
    }),
    prisma.appointment.create({
      data: {
        patientId: patients[2].id,
        doctorId: doctor2.id,
        doctorUserId: doctorUser2.id,
        appointmentDate: new Date(tomorrow.setHours(14, 0, 0, 0)),
        status: 'scheduled',
        notes: 'Cardiology consultation',
      },
    }),
    prisma.appointment.create({
      data: {
        patientId: patients[3].id,
        doctorId: doctor2.id,
        doctorUserId: doctorUser2.id,
        appointmentDate: new Date(tomorrow.setHours(15, 30, 0, 0)),
        status: 'scheduled',
        notes: 'Annual physical examination',
      },
    }),
  ]);

// Create Queue Tokens
  await Promise.all([
    prisma.queueToken.create({
      data: {
        patientId: patients[0].id,
        doctorId: doctor1.id, // <-- Replaced hardcoded '1' with dynamic ID
        tokenNumber: 1,
        status: 'waiting',
        priority: 0,
      },
    }),
    prisma.queueToken.create({
      data: {
        patientId: patients[1].id,
        doctorId: doctor1.id, // <-- Replaced hardcoded '1' with dynamic ID
        tokenNumber: 2,
        status: 'waiting',
        priority: 1,
      },
    }),
    prisma.queueToken.create({
      data: {
        patientId: patients[2].id,
        doctorId: doctor2.id, // <-- Replaced hardcoded '2' with dynamic ID
        tokenNumber: 3,
        status: 'called',
        priority: 0,
      },
    }),
  ]);

  console.log('✅ Database seeded successfully!');
  console.log('\n📋 Test Accounts:');
  console.log('   Admin: admin@haqms.com / password123');
  console.log('   Receptionist: reception1@haqms.com / password123');
  console.log('   Doctor 1: doctor1@haqms.com / password123');
  console.log('   Doctor 2: doctor2@haqms.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
