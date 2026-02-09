package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type PublicProof struct {
	StudentHash string `json:"student_hash"`
	Course      string `json:"course"`
	Status      string `json:"status"`
}

type SmartContract struct {
	contractapi.Contract
}

func (s *SmartContract) CreatePublicProof(ctx contractapi.TransactionContextInterface, studentName string, course string) error {
	studentHash := fmt.Sprintf("%x", sha256.Sum256([]byte(studentName)))
	
	proof := PublicProof{
		StudentHash: studentHash,
		Course:      course,
		Status:      "Authentic",
	}

	proofJSON, _ := json.Marshal(proof)
	return ctx.GetStub().PutState(studentHash, proofJSON)
}

func (s *SmartContract) GetPublicProof(ctx contractapi.TransactionContextInterface, studentName string) (*PublicProof, error) {
	studentHash := fmt.Sprintf("%x", sha256.Sum256([]byte(studentName)))
	proofJSON, err := ctx.GetStub().GetState(studentHash)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %v", err)
	}
	if proofJSON == nil {
		return nil, fmt.Errorf("the proof for student hash %s does not exist", studentHash)
	}

	var proof PublicProof
	err = json.Unmarshal(proofJSON, &proof)
	if err != nil {
		return nil, err
	}

	return &proof, nil
}

func main() {
	publicContract := new(SmartContract)
	chaincode, err := contractapi.NewChaincode(publicContract)
	if err != nil {
		fmt.Printf("Error creating public-verifier chaincode: %s", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting public-verifier chaincode: %s", err)
	}
}