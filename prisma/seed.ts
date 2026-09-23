import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';

async function upsertUser(email: string, name: string, role: 'GUEST' | 'STAFF' | 'ADMIN') {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  console.log('Seeding database...');

  const admin = await upsertUser('admin@hotel.demo', 'Alex Admin', 'ADMIN');
  const staff = await upsertUser('staff@hotel.demo', 'Sam Staff', 'STAFF');
  const guest = await upsertUser('guest@hotel.demo', 'Gabi Guest', 'GUEST');

  const roomsData = [
    {
      name: 'Deluxe Double',
      type: 'Double',
      description: 'Spacious double room with a queen bed and city view.',
      capacity: 2,
      pricePerNight: 120,
      imageUrl: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800',
    },
    {
      name: 'Classic Single',
      type: 'Single',
      description: 'Cozy single room, perfect for solo travelers.',
      capacity: 1,
      pricePerNight: 75,
      imageUrl: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800',
    },
    {
      name: 'Family Suite',
      type: 'Suite',
      description: 'Two-room suite with a king bed and a sofa bed, sleeps up to 4.',
      capacity: 4,
      pricePerNight: 220,
      imageUrl: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
    },
    {
      name: 'Executive Suite',
      type: 'Suite',
      description: 'Premium suite with a private balcony and lounge area.',
      capacity: 3,
      pricePerNight: 260,
      imageUrl: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800',
    },
    {
      name: 'Standard Twin',
      type: 'Twin',
      description: 'Two single beds, ideal for colleagues or friends traveling together.',
      capacity: 2,
      pricePerNight: 95,
      imageUrl: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800',
    },
  ];

  const rooms = [];
  for (const data of roomsData) {
    const existing = await prisma.room.findFirst({ where: { name: data.name } });
    const room = existing ?? (await prisma.room.create({ data }));
    rooms.push(room);
  }

  // A few demo reservations so the availability calendar has something to show.
  const today = new Date();
  const inDays = (n: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };

  const existingReservations = await prisma.reservation.count();
  if (existingReservations === 0) {
    await prisma.reservation.createMany({
      data: [
        { roomId: rooms[0].id, userId: guest.id, checkIn: inDays(3), checkOut: inDays(6), guests: 2 },
        { roomId: rooms[0].id, userId: guest.id, checkIn: inDays(12), checkOut: inDays(14), guests: 2 },
        { roomId: rooms[2].id, userId: guest.id, checkIn: inDays(5), checkOut: inDays(9), guests: 3 },
      ],
    });
  }

  console.log('Seed complete. Demo accounts (password for all: %s):', DEMO_PASSWORD);
  console.log(`  Admin: ${admin.email}`);
  console.log(`  Staff: ${staff.email}`);
  console.log(`  Guest: ${guest.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
