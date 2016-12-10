/* eslint-env mocha */

import { expect } from 'chai';

import { normalize, Schema, arrayOf } from 'normalizr';
import { denormalize } from '../src';

describe('denormalize memoized', () => {
  const Book = new Schema('books');
  const Author = new Schema('authors');
  const Review = new Schema('reviews');
  Book.define({
    author: Author,
    reviews: arrayOf(Review),
  });

  Author.define({
    books: arrayOf(Book),
  });

  describe('Single Entity Response without circular dependency', () => {
    const response = {
      id: 1,
      title: 'Game of Thrones',
      reviews: [
        {
          id: 1,
          content: 'Super livre',
        },
        {
          id: 2,
          content: 'Bof bof',
        },
      ],
      author: {
        id: 1,
        name: 'Georges RR Martin',
      },
    };

    it('should reuse cache fully when called with the same entities', () => {
      const normalized = normalize(response, Book);

      const denormalized1 = denormalize(
        normalized.result,
        normalized.entities,
        Book,
        { memoized: true },
      );
      const denormalized2 = denormalize(
        normalized.result,
        normalized.entities,
        Book,
        { memoized: true },
      );


      expect(denormalized1).to.equal(denormalized2);
      expect(denormalized1.author).to.equal(denormalized2.author);
      expect(denormalized1.reviews).to.equal(denormalized2.reviews);
    });

    it('should reuse cache partially when part of the entities update', () => {
      const normalized = normalize(response, Book);

      const denormalized1 = denormalize(
        normalized.result,
        normalized.entities,
        Book,
        { memoized: true },
      );
      normalized.entities.authors[1] = {
        ...normalized.entities.authors[1],
        name: 'Georges RR Updated',
      };

      const denormalized2 = denormalize(
        normalized.result,
        normalized.entities,
        Book,
        { memoized: true },
      );

      normalized.entities.reviews[1] = {
        ...normalized.entities.reviews[1],
        content: 'I got updated !',
      };

      const denormalized3 = denormalize(
        normalized.result,
        normalized.entities,
        Book,
        { memoized: true },
      );

      expect(denormalized1).to.not.equal(denormalized2);
      expect(denormalized2).to.not.equal(denormalized3);


      expect(denormalized1.author).to.not.equal(denormalized2.author);
      expect(denormalized1.author).to.not.equal(denormalized3.author);
      expect(denormalized2.author).to.equal(denormalized3.author);

      expect(denormalized1.reviews).to.equal(denormalized2.reviews);
      expect(denormalized2.reviews).to.not.equal(denormalized3.reviews);
      expect(denormalized1.reviews).to.not.equal(denormalized3.reviews);
    });
  });

  describe('Single Entity Response with circular dependency', () => {
    const response = {
      id: 1,
      title: 'Game of Thrones',
      reviews: [
        {
          id: 1,
          content: 'Super livre',
        },
        {
          id: 2,
          content: 'Bof bof',
        },
      ],
      author: {
        id: 1,
        name: 'Georges RR Martin',
        books: [1, 2],
      },
    };

    it('should reuse cache fully', () => {
      const normalized = normalize(response, Book);
      normalized.entities.books[2] = {
        id: 2,
        title: 'Livre 2',
        author: 1,
      };

      const denormalized1 = denormalize(
        normalized.result,
        normalized.entities,
        Book,
        { memoized: true },
      );
      const denormalized2 = denormalize(
        normalized.result,
        normalized.entities,
        Book,
        { memoized: true },
      );

      expect(denormalized1).to.equal(denormalized2);
      expect(denormalized1.author).to.equal(denormalized2.author);
      expect(denormalized1.reviews).to.equal(denormalized2.reviews);
    });
  });

  describe('array of entities', () => {
    const response = [
      {
        id: 1,
        title: 'Game of Thrones',
        reviews: [
          {
            id: 1,
            content: 'Super livre',
          },
          {
            id: 2,
            content: 'Bof bof',
          },
        ],
        author: {
          id: 1,
          name: 'Georges RR Martin',
        },
      },
      {
        id: 2,
        title: 'Harry Potter',
        author: {
          id: 2,
          name: 'JK Rowling',
        },
      },
    ];

    const normalized = normalize(response, arrayOf(Book));

    it('should returns the same array on the second call', () => {
      const books1 = denormalize(
        normalized.result,
        normalized.entities,
        arrayOf(Book),
        { memoized: true },
      );
      const books2 = denormalize(
        books1,
        normalized.entities,
        arrayOf(Book),
        { memoized: true },
      );
      // Using the result: an array of ID so returned array will be different
      const books3 = denormalize(
        normalized.result,
        normalized.entities,
        arrayOf(Book),
        { memoized: true },
      );

      expect(books1).to.equal(books2);
      expect(books3).to.not.equal(books2);
    });
  });
});
